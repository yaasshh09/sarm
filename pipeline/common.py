"""Shared site grid, quantization and manifest helpers for every baker (PLAN.md 4, baked raster format)."""
import json
import math
from pathlib import Path

import numpy as np
import yaml

HERE = Path(__file__).parent
DATA = HERE.parent / "web" / "public" / "data"
DB_MIN, DB_MAX = -35.0, 5.0
TARGET_PX = 30.0   # EPSG:3857 meters
MAX_PX = 1200
R = 6378137.0


def load_sites():
    return yaml.safe_load(open(HERE / "sites.yaml", encoding="utf-8"))["sites"]


def site_grid(site):
    """Square EPSG:3857 grid, identical for every sensor and date of a site."""
    from rasterio.transform import from_bounds
    from rasterio.warp import transform

    lat, lon = site["center"]
    half = site["size_km"] * 500 / math.cos(math.radians(lat))  # 3857 meters stretch by 1/cos(lat)
    cx = R * math.radians(lon)
    cy = R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    b = (cx - half, cy - half, cx + half, cy + half)
    n = min(MAX_PX, math.ceil(2 * half / TARGET_PX))
    # MapLibre image source order: top-left, top-right, bottom-right, bottom-left
    xs, ys = transform("EPSG:3857", "EPSG:4326", [b[0], b[2], b[2], b[0]], [b[3], b[3], b[1], b[1]])
    return {"bounds3857": b, "shape": (n, n), "transform": from_bounds(*b, n, n),
            "cornersLngLat": [[round(x, 6), round(y, 6)] for x, y in zip(xs, ys)]}


def to_grid(arr, src_transform, src_crs, grid):
    """Reproject linear power onto the site grid. Average resampling, so speckle is multilooked in power."""
    from rasterio.warp import Resampling, reproject

    out = np.full(grid["shape"], np.nan, np.float32)
    reproject(arr, out, src_transform=src_transform, src_crs=src_crs, dst_transform=grid["transform"],
              dst_crs="EPSG:3857", resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    return out


def quantize_db(db):
    """0 = nodata, 1..255 = DB_MIN..DB_MAX."""
    v = np.zeros(db.shape, np.uint8)
    ok = np.isfinite(db)
    v[ok] = (1 + np.round((np.clip(db[ok], DB_MIN, DB_MAX) - DB_MIN) / (DB_MAX - DB_MIN) * 254)).astype(np.uint8)
    return v


def dequantize(v):
    db = (v.astype(np.float32) - 1) / 254 * (DB_MAX - DB_MIN) + DB_MIN
    db[v == 0] = np.nan
    return db


def write_png(path, v):
    from PIL import Image

    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(v, mode="L").save(path, optimize=True)


def update_manifest(site, grid, sensor, layers):
    """Replace this sensor's layers, keep the others."""
    p = DATA / site["id"] / "manifest.json"
    m = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    m.update(id=site["id"], name=site["name"], bounds3857=[round(c, 2) for c in grid["bounds3857"]],
             cornersLngLat=grid["cornersLngLat"], shape=list(grid["shape"]), db={"min": DB_MIN, "max": DB_MAX})
    m["layers"] = [l for l in m.get("layers", []) if l["sensor"] != sensor] + layers
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(m, indent=1), encoding="utf-8")


if __name__ == "__main__":
    db = np.array([-40, -35, -20.03, 0, 5, 9, np.nan], np.float32)
    v = quantize_db(db)
    assert v[0] == 1 and v[1] == 1 and v[4] == 255 and v[5] == 255 and v[6] == 0, v
    back = dequantize(v)
    assert abs(back[2] - -20.03) <= 0.08 and abs(back[3]) <= 0.08 and np.isnan(back[6]), back
    g = site_grid({"center": [24.45, 54.45], "size_km": 35})
    tl, tr, br, bl = g["cornersLngLat"]
    assert tl[0] < tr[0] and tl[1] > bl[1] and abs(tl[1] - tr[1]) < 1e-9, g["cornersLngLat"]
    assert abs((tr[0] - tl[0]) - 35 / (111.32 * math.cos(math.radians(24.45)))) < 0.01  # about 35 km wide
    print("common selftest ok", g["shape"])
