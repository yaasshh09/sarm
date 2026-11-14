"""M1: stream NISAR GCOV AOI subsets over HTTPS and bake them onto the site grid.

Usage: python pipeline/bake_nisar.py <site-id> [<site-id> ...]
Needs EARTHDATA_TOKEN. Writes web/public/data/<site>/{nisar/*.png, manifest.json, stats.json}.
Any failed granule stops the run before the manifest is written (PLAN.md rule 2).
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

import coverage
from common import DATA, load_sites, quantize_db, site_grid, to_grid, update_manifest, write_png

GRIDS = "/science/LSAR/GCOV/grids/frequencyA"
RADAR_GRID = "/science/LSAR/GCOV/metadata/radarGrid"
POLS = {"HHHH": "HH", "HVHV": "HV", "VVVV": "VV", "VHVH": "VH"}
PAD_M = 200
FLOOR_POW = 10 ** (-50 / 10)
MIN_VALID_PCT = 90  # below this a date is flagged as partial coverage


def granules(site):
    """Usable granules of the confirmed stack, same filter as coverage.py."""
    import asf_search as asf
    from shapely import wkt

    st = site["stack"]
    w = coverage.aoi_wkt(*site["center"], site["size_km"])
    res = asf.search(dataset="NISAR", processingLevel="GCOV", intersectsWith=w, start=coverage.CALIBRATED_START)
    rows = coverage.dedupe([coverage.to_row(r, wkt.loads(w)) for r in res])
    urls = {r.properties["fileID"]: r.properties["url"] for r in res}
    key = (st["track"], st["dir"], st["frame"], st["bw"])
    return [dict(r, url=urls[r["granule"]]) for r in rows
            if (r["track"], r["dir"], r["frame"], r["bw"]) == key and coverage.usable(r)]


def incidence(h, epsg, grid):
    """Incidence angle at the AOI center, from the radarGrid cube at the height level nearest 0 m."""
    from rasterio.warp import transform

    rg = h[RADAR_GRID]
    assert int(rg["projection"][()]) == epsg, "radarGrid projection differs from the GCOV grid"
    b = grid["bounds3857"]
    (x,), (y,) = transform("EPSG:3857", f"EPSG:{epsg}", [(b[0] + b[2]) / 2], [(b[1] + b[3]) / 2])
    k = int(np.argmin(np.abs(rg["heightAboveEllipsoid"][:])))
    i = int(np.argmin(np.abs(rg["yCoordinates"][:] - y)))
    j = int(np.argmin(np.abs(rg["xCoordinates"][:] - x)))
    return round(float(rg["incidenceAngle"][k, i, j]), 1)


def bake_one(site, grid, row):
    import fsspec
    import h5py
    from rasterio.transform import from_origin
    from rasterio.warp import transform_bounds

    fs = fsspec.filesystem("https", client_kwargs={"headers": {"Authorization": "Bearer " + os.environ["EARTHDATA_TOKEN"]}})
    layers, stats, log = [], {"date": row["date"]}, []
    with fs.open(row["url"], cache_type="background", block_size=8 << 20) as f, h5py.File(f, "r") as h:
        g = h[GRIDS]
        epsg = int(g["projection"].attrs["epsg_code"])
        x, y = g["xCoordinates"][:], g["yCoordinates"][:]
        dx, dy = x[1] - x[0], y[1] - y[0]  # dy is negative (north-up)
        xmin, ymin, xmax, ymax = transform_bounds("EPSG:3857", f"EPSG:{epsg}", *grid["bounds3857"], densify_pts=21)
        c0, c1 = max(0, int((xmin - PAD_M - x[0]) / dx)), min(len(x), int((xmax + PAD_M - x[0]) / dx) + 1)
        r0, r1 = max(0, int((ymax + PAD_M - y[0]) / dy)), min(len(y), int((ymin - PAD_M - y[0]) / dy) + 1)
        if c1 <= c0 or r1 <= r0:
            raise RuntimeError(f"AOI outside granule {row['granule']}")
        # mask: 0 = partially focused, 255 = outside the swath, 1..254 = subswath number of a valid sample
        m = g["mask"][r0:r1, c0:c1]
        valid = (m > 0) & (m < 255)
        src_t = from_origin(x[c0] - dx / 2, y[r0] - dy / 2, dx, -dy)  # coordinates are pixel centers
        inc = incidence(h, epsg, grid)
        terms = [t.decode() for t in g["listOfCovarianceTerms"][:]]
        for term in (t for t in terms if t in POLS):
            pol = POLS[term]
            p = g[term][r0:r1, c0:c1].astype(np.float32)
            # Below -50 dB is far under the L-band noise floor: swath-edge fill (seen down to -122 dB at Kosi),
            # not a measurement. The comparison also drops NaN fill.
            p[~valid | ~(p > FLOOR_POW)] = np.nan
            db = 10 * np.log10(to_grid(p, src_t, f"EPSG:{epsg}", grid))
            fn = f"nisar/{row['date'].replace('-', '')}_{pol}.png"
            write_png(DATA / site["id"] / fn, quantize_db(db))
            ok = np.isfinite(db)
            med = float(np.median(db[ok])) if ok.any() else None
            layers.append({"sensor": "NISAR", "band": "L", "date": row["date"], "pol": pol, "tier": row["tier"],
                           "track": row["track"], "frame": row["frame"], "direction": row["dir"],
                           "bandwidthMHz": row["bw"], "file": fn, "granule": row["granule"],
                           "incidenceDeg": inc, "validPct": round(100 * float(ok.mean()), 1)})
            stats[pol] = None if med is None else round(med, 2)
            log.append(f"  {row['date']} {pol} {row['tier'][:4]} valid {100 * ok.mean():5.1f}%  dB min/med/max "
                       + (f"{np.nanmin(db):6.1f} {med:6.1f} {np.nanmax(db):6.1f}" if ok.any() else "no data"))
    return layers, stats, "\n".join(log)


def bake_site(site):
    grid = site_grid(site)
    rows = granules(site)
    print(f"{site['id']}: {len(rows)} granules on stack {site['stack']}, grid {grid['shape']}", flush=True)
    for old in (DATA / site["id"] / "nisar").glob("*.png"):  # generated output only
        old.unlink()
    with ProcessPoolExecutor(4) as ex:
        results = list(ex.map(bake_one, [site] * len(rows), [grid] * len(rows), rows))
    for _, _, log in results:
        print(log)
    update_manifest(site, grid, "NISAR", [l for ls, _, _ in results for l in ls])
    (DATA / site["id"] / "stats.json").write_text(json.dumps([s for _, s, _ in results], indent=1), encoding="utf-8")
    apply_flags(site)


def apply_flags(site):
    """Copy sites.yaml flags, plus automatic partial-coverage flags, onto manifest layers and stats rows.
    Metadata only, no download."""
    flags = dict(site.get("flags", {}))
    layers = json.loads((DATA / site["id"] / "manifest.json").read_text(encoding="utf-8"))["layers"]
    for l in layers:
        if l["sensor"] == "NISAR" and l["validPct"] < MIN_VALID_PCT and l["date"] not in flags:
            flags[l["date"]] = (f"Partial coverage: only {l['validPct']}% of the AOI has valid data on this date "
                                "(swath edge or partially focused samples).")
    for name in ("manifest.json", "stats.json"):
        p = DATA / site["id"] / name
        d = json.loads(p.read_text(encoding="utf-8"))
        for r in (d["layers"] if name == "manifest.json" else d):
            if r.get("sensor", "NISAR") != "NISAR":
                continue
            r.pop("flag", None)
            if r["date"] in flags:
                r["flag"] = flags[r["date"]]
        p.write_text(json.dumps(d, indent=1), encoding="utf-8")
    print(f"{site['id']}: flagged {sorted(flags) or 'nothing'}")


if __name__ == "__main__":
    sites = {s["id"]: s for s in load_sites()}
    if sys.argv[1] == "--flags":
        for sid in sys.argv[2:]:
            apply_flags(sites[sid])
        sys.exit()
    if not os.environ.get("EARTHDATA_TOKEN"):
        sys.exit("set EARTHDATA_TOKEN")
    for sid in sys.argv[1:]:
        bake_site(sites[sid])
