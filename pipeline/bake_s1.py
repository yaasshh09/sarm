"""M3: Sentinel-1 C-band history for Rewind (PLAN.md 5.3).

Usage: python pipeline/bake_s1.py <site-id> [<site-id> ...]
Source: Planetary Computer sentinel-1-rtc (gamma0 power, 10 m UTM COGs). Anonymous SAS signing works for it,
so no account is needed. One relative orbit per site (sites.yaml `s1`), same month every year, temporal median
in power of up to MAX_DATES full-AOI passes to beat speckle. Same grid and quantization as NISAR.
"""
import calendar
import collections
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor

import numpy as np

import coverage
from common import DATA, load_sites, quantize_db, site_grid, update_manifest, write_png

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
YEARS = range(2015, 2027)
MAX_DATES = 4
MIN_AOI = 0.9


def periods(cfg):
    return [f"{y}-{cfg['month']:02d}" for y in YEARS] + list(cfg.get("extra", []))


def passes(cat, aoi, cfg, period):
    """Full-AOI passes on the configured orbit in one month, as {date: [items]}. A pass can span several slices."""
    from shapely.geometry import shape

    y, m = map(int, period.split("-"))
    items = cat.search(collections=["sentinel-1-rtc"], intersects=aoi.__geo_interface__,
                       datetime=f"{period}-01/{period}-{calendar.monthrange(y, m)[1]}").item_collection()
    by = collections.defaultdict(list)
    for it in items:
        p = it.properties
        # dual-pol only: some passes are VV-only and have no vh asset
        if p["sat:relative_orbit"] == cfg["orbit"] and p["sat:orbit_state"][0].upper() == cfg["dir"] \
                and {"vv", "vh"} <= set(it.assets):
            by[str(it.datetime.date())].append(it)
    full = {}
    for d, its in sorted(by.items()):
        u = shape(its[0].geometry)
        for it in its[1:]:
            u = u.union(shape(it.geometry))
        if u.intersection(aoi).area / aoi.area >= MIN_AOI:
            full[d] = its
    return dict(list(full.items())[:MAX_DATES])


def read_power(item, pol, grid):
    """One slice resampled onto the site grid (average in power), NaN outside the slice."""
    import planetary_computer as pc
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT

    h, w = grid["shape"]
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open(pc.sign(item.assets[pol.lower()].href)) as ds, \
            WarpedVRT(ds, crs="EPSG:3857", transform=grid["transform"], width=w, height=h,
                      resampling=Resampling.average, src_nodata=ds.nodata, nodata=np.nan, dtype="float32") as v:
        a = v.read(1)
    a[~(a > 0)] = np.nan  # zero or negative gamma0 is fill, not a measurement
    return a


def bake_period(site, grid, cfg, period, dates):
    layers, log = [], []
    for pol in ("VV", "VH"):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN pixels outside the swath
            # slices of one pass barely overlap, so a mean just stitches them
            per_date = [np.nanmean(np.stack([read_power(it, pol, grid) for it in its]), 0) for its in dates.values()]
            db = 10 * np.log10(np.nanmedian(np.stack(per_date), 0))
        fn = f"s1/{period.replace('-', '')}_{pol}.png"
        write_png(DATA / site["id"] / fn, quantize_db(db))
        ok = np.isfinite(db)
        layers.append({"sensor": "S1", "band": "C", "date": period, "pol": pol, "orbit": cfg["orbit"],
                       "direction": cfg["dir"], "product": "sentinel-1-rtc (Planetary Computer)", "file": fn,
                       "scenes": sorted({it.id for its in dates.values() for it in its}),
                       "nDates": len(dates), "validPct": round(100 * float(ok.mean()), 1)})
        log.append(f"  {period} {pol} {len(dates)} dates valid {100 * ok.mean():5.1f}%  dB min/med/max "
                   + (f"{np.nanmin(db):6.1f} {np.nanmedian(db):6.1f} {np.nanmax(db):6.1f}" if ok.any() else "no data"))
    return layers, "\n".join(log)


def bake_site(site):
    import pystac_client
    from shapely import wkt

    cfg = site["s1"]
    grid = site_grid(site)
    aoi = wkt.loads(coverage.aoi_wkt(*site["center"], site["size_km"]))
    cat = pystac_client.Client.open(STAC)
    plan = {p: passes(cat, aoi, cfg, p) for p in periods(cfg)}
    missing = [p for p, d in plan.items() if not d]
    if missing:  # rule 2: report the hole, never fill it from a neighbor year
        print(f"{site['id']}: no full-AOI pass on orbit {cfg['orbit']}{cfg['dir']} in {missing}, skipping those")
    plan = {p: d for p, d in plan.items() if d}
    print(f"{site['id']}: S1 orbit {cfg['orbit']}{cfg['dir']}, " + ", ".join(f"{p}:{len(d)}" for p, d in plan.items()), flush=True)
    for old in (DATA / site["id"] / "s1").glob("*.png"):  # generated output only
        old.unlink()
    with ThreadPoolExecutor(4) as ex:  # GDAL reads release the GIL
        results = list(ex.map(lambda p: bake_period(site, grid, cfg, p, plan[p]), plan))
    for _, log in results:
        print(log)
    update_manifest(site, grid, "S1", [l for ls, _ in results for l in ls])


if __name__ == "__main__":
    ps = periods({"month": 8, "extra": ["2026-03"]})
    assert ps[0] == "2015-08" and ps[11] == "2026-08" and ps[-1] == "2026-03", ps
    sites = {s["id"]: s for s in load_sites()}
    for sid in sys.argv[1:]:
        bake_site(sites[sid])
