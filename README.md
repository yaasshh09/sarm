# Sarm

NASA Space Apps 2026, challenge **Dancing With SARs**. An open-source web app for tracking surface change with NISAR L-band radar.

Live: https://yaasshh09.github.io/sarm/

- **Globe**: a spinning NASA Blue Marble Earth. Fly down to a site, or take a guided tour of all five, and see the newest NISAR pass draped over it.
- **Explore**: real NISAR GCOV backscatter over each site, with swipe, change maps, pixel time series and a guided "Try this" for every site.
- **Rewind**: Sentinel-1 C-band (2015+) and Landsat optical (1985+) for longer context, always labelled as other sensors, plus a then-vs-now photo comparison. Links like `#rewind/lake-mead/then` open straight into it.

Data: NISAR L2 GCOV via ASF DAAC, Sentinel-1 RTC and Landsat C2 L2 via Microsoft Planetary Computer. Sites: the Abu Dhabi coast (land reclamation), the Kosi River in Bihar (monsoon floods), the Rondônia forest edge in Brazil (deforestation), Lake Mead (drought) and Kīlauea in Hawaiʻi (lava flows). Full plan in [PLAN.md](PLAN.md). Coverage evidence in [pipeline/coverage_report.md](pipeline/coverage_report.md).

## Develop

```
cd web && npm install && npm run dev
python -m venv pipeline/.venv && pipeline/.venv/Scripts/pip install -r pipeline/requirements.txt
python pipeline/coverage.py
```

Earthdata token goes in env var `EARTHDATA_TOKEN`. Never commit it.

License: MIT.
