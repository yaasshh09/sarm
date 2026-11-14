# titiler-cmr test (PLAN.md section 3), 2026-11-15, about 2 min of the 15 min budget

Endpoint: `https://openveda.cloud/api/titiler-cmr/xarray/tiles/WebMercatorQuad/{z}/{x}/{y}.png`, no auth.
Test tile: z10/666/440 over Abu Dhabi. Params: `variables=HHHH`, `group=science/LSAR/GCOV/grids/frequencyA`, `rescale=0,0.3`.

| collection_concept_id | selector | result |
|---|---|---|
| C3622214170-ASF (the ID in PLAN.md) | temporal 2026-10-27..29 or 2026-10-16 | 204 No Content: wrong collection for GCOV on these dates |
| C3622241360-ASF (NISAR_L2_GCOV_V1, VALIDATED) | granule_ur=...20261028T014300... | 200 image/png, 67.8 kB, 7.4 s cold |
| C3622241360-ASF (VALIDATED) | temporal 2026-10-28 | 200 image/png, 3.7 s |
| C2854338529-ASF (NISAR_L2_GCOV_PROVISIONAL_V1) | temporal 2026-10-16 | 200 image/png, 4.3 s |

CORS: `Access-Control-Allow-Origin` echoes the request origin (tested with `https://yaasshh09.github.io`).
The tile shows real L-band backscatter (bright city, dark water).

Verdict: **PASS**. Stretch S2 is viable. Use the concept IDs above, not the one in PLAN.md. Use `frequencyA` (main band), not `frequencyB`.
Caveats: a temporal window with several granules (e.g. 20+5 and 40+5 products on one date) gets mosaicked, so pin `granule_ur` for a clean single-geometry tile. Cold tiles take 4 to 8 s.
