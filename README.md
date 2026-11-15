# Sarm

NASA Space Apps 2026, challenge **Dancing With SARs**. An open-source web app for tracking surface change with NISAR L-band radar.

Live: https://yaasshh09.github.io/sarm/

- **Lab**: a SAR physics simulator in the browser. Fly the radar, record echoes, focus them into an image.
- **Explore**: real NISAR GCOV backscatter over chosen sites, with change maps and pixel time series.
- **Rewind**: Sentinel-1 C-band (2014+) and Landsat optical (1984+) for longer context, always labelled as other sensors.

Data: NISAR L2 GCOV via ASF DAAC. Full plan in [PLAN.md](PLAN.md). Coverage evidence in [pipeline/coverage_report.md](pipeline/coverage_report.md).

## Develop

```
cd web && npm install && npm run dev
python -m venv pipeline/.venv && pipeline/.venv/Scripts/pip install -r pipeline/requirements.txt
python pipeline/coverage.py
```

Earthdata token goes in env var `EARTHDATA_TOKEN`. Never commit it.

License: MIT.
