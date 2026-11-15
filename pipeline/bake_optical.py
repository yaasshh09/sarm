"""M3: Landsat true-color history for Rewind (PLAN.md 5.4).

Usage: python pipeline/bake_optical.py <site-id> [<site-id> ...]
Source: Planetary Computer landsat-c2-l2 (surface reflectance, Landsat 4/5 TM, 7 ETM+, 8/9 OLI).
One cloud-masked median composite every 5 years 1985 to 2025, from scenes within one year of the target in the
site's allowed months. Landsat 7 (SLC-off after 2003) is used only when too few other scenes exist.
Kosi also gets one raw peak-monsoon scene, clouds included.
"""
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor

import numpy as np

import coverage
from common import DATA, load_sites, site_grid, update_manifest

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
TARGETS = range(1985, 2026, 5)
MAX_SCENES = 8
MIN_GOOD = 3        # fewer non-L7 scenes than this and Landsat 7 joins in
MAX_CLOUD = 20
GAMMA = 0.6
# QA_PIXEL bits: 0 fill, 1 dilated cloud, 2 cirrus, 3 cloud, 4 cloud shadow
QA_BAD = 0b11111


def search(cat, aoi, start, end, cloud=MAX_CLOUD):
    q = {"eo:cloud_cover": {"lt": cloud}} if cloud is not None else None
    return list(cat.search(collections=["landsat-c2-l2"], intersects=aoi.__geo_interface__,
                           datetime=f"{start}/{end}", query=q).items())


def pick(items, months):
    items = sorted((i for i in items if i.datetime.month in months), key=lambda i: i.properties["eo:cloud_cover"])
    good = [i for i in items if i.properties["platform"] != "landsat-7"]
    return (good if len(good) >= MIN_GOOD else items)[:MAX_SCENES]


def read_scene(item, grid, mask_clouds=True):
    """RGB reflectance on the site grid, NaN where fill (and cloud, if masked)."""
    import planetary_computer as pc
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT

    h, w = grid["shape"]

    def warp(key, resampling, dtype):
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open(pc.sign(item.assets[key].href)) as ds, \
                WarpedVRT(ds, crs="EPSG:3857", transform=grid["transform"], width=w, height=h,
                          resampling=resampling, nodata=0, dtype=dtype) as v:
            return v.read(1)

    qa = warp("qa_pixel", Resampling.nearest, "uint16")
    bad = (qa == 0) | ((qa & (QA_BAD if mask_clouds else 1)) > 0)
    rgb = np.stack([warp(k, Resampling.bilinear, "uint16") for k in ("red", "green", "blue")]).astype(np.float32)
    bad |= (rgb == 0).any(0)
    rgb = rgb * 2.75e-5 - 0.2  # Collection 2 L2 scale and offset
    rgb[:, bad] = np.nan
    return rgb


def composite(items, grid, mask_clouds=True):
    with ThreadPoolExecutor(4) as ex:
        stack = np.stack(list(ex.map(lambda i: read_scene(i, grid, mask_clouds), items)))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # pixels cloudy in every scene
        return np.nanmedian(stack, 0)


def to_jpeg(path, rgb, hi):
    from PIL import Image

    v = np.clip(np.nan_to_num(rgb, nan=0) / hi, 0, 1) ** GAMMA * 255
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.round(v).astype(np.uint8).transpose(1, 2, 0), "RGB").save(path, quality=85, optimize=True)


def layer(date, fn, items, rgb, hi, **extra):
    return {"sensor": "Landsat", "date": date, "file": fn,
            "platforms": sorted({i.properties["platform"] for i in items}), "scenes": [i.id for i in items],
            "validPct": round(100 * float(np.isfinite(rgb).all(0).mean()), 1), "stretchMax": round(hi, 3), **extra}


def bake_site(site):
    import pystac_client
    from shapely import wkt

    cfg = site["optical"]
    grid = site_grid(site)
    aoi = wkt.loads(coverage.aoi_wkt(*site["center"], site["size_km"]))
    cat = pystac_client.Client.open(STAC)
    comps = {}
    for y in TARGETS:
        items = pick(search(cat, aoi, f"{y - 1}-01-01", f"{y + 1}-12-31"), cfg["months"])
        if not items:  # rule 2: report the hole, never borrow another year
            print(f"{site['id']}: no Landsat scenes for {y}, skipping")
            continue
        comps[y] = (items, composite(items, grid))
        print(f"  {y}: {len(items)} scenes {sorted({i.properties['platform'] for i in items})}, "
              f"valid {100 * np.isfinite(comps[y][1]).all(0).mean():5.1f}%", flush=True)
    # One fixed stretch per site so brightness is comparable across years: 99th percentile of the latest composite.
    hi = float(np.nanpercentile(comps[max(comps)][1], 99))
    for old in (DATA / site["id"] / "optical").glob("*.jpg"):  # generated output only
        old.unlink()
    layers = []
    for y, (items, rgb) in comps.items():
        fn = f"optical/{y}.jpg"
        to_jpeg(DATA / site["id"] / fn, rgb, hi)
        layers.append(layer(str(y), fn, items, rgb, hi, window=f"{y - 1}/{y + 1}",
                            note="Landsat 7 SLC-off stripes may remain" if any(
                                i.properties["platform"] == "landsat-7" and y > 2003 for i in items) else None))
    if "monsoon" in cfg:
        mo = cfg["monsoon"]
        items = [i for i in search(cat, aoi, f"{mo}-01", f"{mo}-31", cloud=None)
                 if i.properties["platform"] in ("landsat-8", "landsat-9")]
        items = sorted(items, key=lambda i: i.properties["eo:cloud_cover"])[:1]
        if items:
            rgb = composite(items, grid, mask_clouds=False)
            fn = f"optical/monsoon-{mo.replace('-', '')}.jpg"
            to_jpeg(DATA / site["id"] / fn, rgb, hi)
            cc = items[0].properties["eo:cloud_cover"]
            layers.append(layer(str(items[0].datetime.date()), fn, items, rgb, hi, raw=True, cloudCoverPct=cc,
                                note=f"Single raw scene, clouds included ({cc:.0f}% scene cloud cover, least cloudy of the month)"))
            print(f"  monsoon {mo}: {items[0].id} cloud {cc}%")
        else:
            print(f"{site['id']}: no Landsat 8/9 scene in {mo}")
    update_manifest(site, grid, "Landsat", [{k: v for k, v in l.items() if v is not None} for l in layers])
    print(f"{site['id']}: {len(layers)} optical layers, stretch max {hi:.3f}")


if __name__ == "__main__":
    class I:  # minimal stand-in for a STAC item
        def __init__(s, p, cc, m):
            s.properties, s.datetime = {"platform": p, "eo:cloud_cover": cc}, type("d", (), {"month": m})
    got = pick([I("landsat-7", 1, 1), I("landsat-5", 9, 2), I("landsat-5", 5, 7)], [1, 2, 3])
    assert [i.properties["eo:cloud_cover"] for i in got] == [1, 9], "L7 joins when too few others; month filter holds"
    sites = {s["id"]: s for s in load_sites()}
    for sid in sys.argv[1:]:
        bake_site(sites[sid])
