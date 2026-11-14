"""Step 0: what NISAR GCOV (and GUNW) data exists per site.

Usage: python pipeline/coverage.py [--selftest]
Writes pipeline/coverage_report.md and prints the same tables.
Search is anonymous; no token needed.
"""
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

HERE = Path(__file__).parent
MIN_DATES = 6       # PLAN.md 5.0 site selection rule
MIN_AOI_PCT = 90    # a scene must cover most of the AOI to be bakeable
CALIBRATED_START = "2026-06-17"
TIER_RANK = {"VALIDATED": 2, "PROVISIONAL": 1, "BETA": 0}


def aoi_wkt(lat, lon, size_km):
    dlat = size_km / 2 / 110.574
    dlon = size_km / 2 / (111.320 * math.cos(math.radians(lat)))
    w, e, s, n = lon - dlon, lon + dlon, lat - dlat, lat + dlat
    return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"


def tier(collection):
    # nisar-docs products-overview: maturity is in the collection name, VALIDATED has none.
    c = collection.upper()
    return "BETA" if "BETA" in c else "PROVISIONAL" if "PROVISIONAL" in c else "VALIDATED"


def to_row(r, aoi):
    from shapely.geometry import shape
    p = r.properties
    foot = shape(r.geometry)
    return {
        "date": p["startTime"][:10],
        "tier": tier(p["collectionName"]),
        "track": p["pathNumber"],
        "frame": p["frameNumber"],
        "dir": p["flightDirection"][0],
        "bw": (p.get("rangeBandwidth") or ["?"])[0],
        "pols": "+".join(p.get("mainBandPolarization") or []),
        "aoi": round(100 * foot.intersection(aoi).area / aoi.area),
        "processed": p.get("processingDate") or "",
        "granule": p["fileID"],
    }


def dedupe(rows):
    """One row per (track, dir, frame, bw, date). VALIDATED > PROVISIONAL > BETA, then newest processing."""
    best = {}
    for r in rows:
        if "QA_STATS" in r["granule"]:
            continue
        k = (r["track"], r["dir"], r["frame"], r["bw"], r["date"])
        if k not in best or (TIER_RANK[r["tier"]], r["processed"]) > (TIER_RANK[best[k]["tier"]], best[k]["processed"]):
            best[k] = r
    return sorted(best.values(), key=lambda r: (r["date"], r["track"], r["frame"]))


def usable(r):
    # Docs: PROVISIONAL starts 2026-06-17. ASF also holds some earlier scenes labelled PROVISIONAL
    # (undocumented); exclude them until a human confirms they are calibrated.
    return (r["tier"] != "BETA" and r["date"] >= CALIBRATED_START
            and {"HH", "HV"} <= set(r["pols"].split("+")) and r["aoi"] >= MIN_AOI_PCT)


def stacks(rows):
    """Group by one geometry (track, dir, frame, bandwidth). Never mix these in a time series."""
    g = defaultdict(list)
    for r in rows:
        g[(r["track"], r["dir"], r["frame"], r["bw"])].append(r)
    out = []
    for k, rs in g.items():
        good = [r for r in rs if usable(r)]
        out.append({"key": k, "n_all": len(rs), "n_usable": len(good),
                    "first": good[0]["date"] if good else "-", "last": good[-1]["date"] if good else "-",
                    "ok": len(good) >= MIN_DATES})
    return sorted(out, key=lambda s: -s["n_usable"])


def md_table(header, rows):
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def gunw_section(results, aoi, event_date):
    from shapely.geometry import shape
    rows = []
    for r in results:
        p = r.properties
        if "QA_STATS" in p["fileID"]:
            continue
        d = re.findall(r"_(\d{8})T\d{6}", p["fileID"])
        ref, sec = (d[0], d[-1]) if d else ("?", "?")
        ev = event_date.replace("-", "")
        rows.append([ref, sec, "yes" if ref < ev <= sec else "no", tier(p["collectionName"]), p["pathNumber"],
                     p["frameNumber"], p["flightDirection"][0],
                     round(100 * shape(r.geometry).intersection(aoi).area / aoi.area), p["fileID"]])
    rows.sort()
    return md_table(["ref", "sec", "spans event", "tier", "track", "frame", "dir", "AOI %", "granule"], rows)


def main():
    import asf_search as asf
    from shapely import wkt as swkt

    sites = yaml.safe_load(open(HERE / "sites.yaml"))["sites"]
    out = ["# NISAR coverage report", "",
           f"Rule: a site is usable if one track+dir+frame+bandwidth stack has >= {MIN_DATES} "
           f"PROVISIONAL/VALIDATED dual-pol (HH+HV) dates covering >= {MIN_AOI_PCT}% of the AOI. "
           f"BETA, and any scene before {CALIBRATED_START} (start of PROVISIONAL per nisar-docs), "
           "is listed but never counted.", ""]
    for s in sites:
        w = aoi_wkt(*s["center"], s["size_km"])
        aoi = swkt.loads(w)
        res = asf.search(dataset="NISAR", processingLevel="GCOV", intersectsWith=w, start="2025-10-01")
        rows = dedupe([to_row(r, aoi) for r in res])
        st = stacks(rows)
        out += [f"## {s['id']} ({s['name']}, {s['status']})", "",
                f"AOI {s['size_km']} km square at {s['center']}. {len(res)} GCOV products found, {len(rows)} after dedupe.", ""]
        out += [md_table(["", "track", "dir", "frame", "bw MHz", "usable dates", "all dates", "first", "last", "verdict"],
                         [["*" if i == 0 and x["ok"] else "", *x["key"], x["n_usable"], x["n_all"], x["first"], x["last"],
                           "USABLE" if x["ok"] else "NOT USABLE"] for i, x in enumerate(st)]), ""]
        out += ["<details><summary>All scenes</summary>", "",
                md_table(["date", "tier", "track", "dir", "frame", "bw", "pols", "AOI %", "counts", "granule"],
                         [[r["date"], r["tier"], r["track"], r["dir"], r["frame"], r["bw"], r["pols"], r["aoi"],
                           "yes" if usable(r) else "no", r["granule"]] for r in rows]),
                "", "</details>", ""]
        if "GUNW" in s["products"]:
            g = asf.search(dataset="NISAR", processingLevel="GUNW", intersectsWith=w, start="2026-06-01")
            out += [f"### GUNW for {s['id']} (event {s['event_date']})", "", f"{len(g)} GUNW products found.", "",
                    gunw_section(g, aoi, str(s["event_date"])), ""]
            pre = [r for r in rows if "2026-06-17" <= r["date"] < str(s["event_date"]) and r["tier"] != "BETA"]
            out += [f"Pre-event GCOV scenes (2026-06-17 to event): {len(pre)} "
                    + ", ".join(f"{r['date']} t{r['track']}{r['dir']} f{r['frame']}" for r in pre), ""]
    text = "\n".join(out)
    (HERE / "coverage_report.md").write_text(text, encoding="utf-8")
    print(text)


def selftest():
    base = dict(track=56, dir="A", frame=14, bw="40+5", pols="HH+HV", aoi=100, processed="2026-11-01")
    rows = [dict(base, date="2026-10-21", tier="PROVISIONAL", granule="p"),
            dict(base, date="2026-10-21", tier="VALIDATED", granule="v"),
            dict(base, date="2026-10-21", tier="VALIDATED", granule="v_QA_STATS")]
    d = dedupe(rows)
    assert len(d) == 1 and d[0]["granule"] == "v", d
    six = [dict(base, date=f"2026-07-{i:02d}", tier="PROVISIONAL", granule=str(i)) for i in range(1, 7)]
    assert stacks(six)[0]["ok"]
    assert not stacks(six[:5])[0]["ok"]
    beta = [dict(r, tier="BETA") for r in six]
    assert stacks(beta)[0]["n_usable"] == 0
    single = [dict(r, pols="HH") for r in six]
    assert stacks(single)[0]["n_usable"] == 0
    partial = [dict(r, aoi=50) for r in six]
    assert stacks(partial)[0]["n_usable"] == 0
    early = [dict(r, date=r["date"].replace("2026-07", "2025-11")) for r in six]
    assert stacks(early)[0]["n_usable"] == 0
    mixed = six[:3] + [dict(r, track=99) for r in six[3:]]  # two tracks never merge
    assert all(not s["ok"] for s in stacks(mixed))
    assert tier("NISAR_L2_GCOV_V1") == "VALIDATED" and tier("NISAR_L2_GCOV_BETA_V1") == "BETA"
    print("selftest ok")


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else main()
