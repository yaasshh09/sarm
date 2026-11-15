# Sarm: implementation plan (Claude Code handoff)

NASA Space Apps 2026, challenge: **Dancing With SARs**.
Name: Sarm.

This file is the single source of truth for the build. Read all of it before writing code.
Sections 1 to 3 are context, 4 to 8 are the spec, 9 is the schedule, 10 to 12 are rules and prompts.

---

## 1. What we are building

A static, open-source web app with three linked modes that tell one story:

| Mode | One-line pitch | Role in judging |
|---|---|---|
| **Explore** | Scrub real NISAR L-band imagery over a site, compare dates, see what changed and why | Core. This is what the challenge asks for |
| **Rewind** | Same site, further back: Sentinel-1 C-band (2014+) and Landsat optical (1984+) on one timeline | Context, "different frequencies", human drivers |
| **Lab** | A real SAR physics simulator in the browser: fly the radar, record echoes, focus them into an image | Education hook, differentiator |

Narrative thread: **learn how radar sees (Lab) → see what NISAR sees now (Explore) → rewind to see how the place got here (Rewind)**.

### Priority correction (important)

The original idea was "SAR simulation + past Earth". The brief is narrower than that:
it requires an interactive app that uses **NISAR data** to **track and visualize surface change**, and asks teams to
**hypothesize physical drivers**, say **which polarizations show the change**, and name **future NISAR applications**.

Consequences:

1. **Explore is the product. Lab and Rewind are supporting acts.** If time runs short, Explore ships first.
2. **NISAR cannot supply "past Earth".** It launched 30 July 2025. Usable calibrated data starts 17 June 2026.
   Anything older must come from Sentinel-1 and Landsat, clearly labeled as other sensors.
3. Lab must be framed around NISAR (its wavelength, geometry, polarizations) and must hand off into the real data,
   or it reads as an unrelated physics demo.

### Requirements traced to the brief

| Brief asks for | Where it lives |
|---|---|
| Interactive app using NISAR data | Explore |
| Track one or more types of surface change | Sites A, B (and C stretch): urban/coastal, flood, deformation |
| Change-detection maps, time-series animations, dashboards | Explore: change map, timeline player, pixel/region charts |
| Different polarizations | Explore: HH, HV, ratio RGB. Lab: pol scattering demo |
| Different frequencies (other sensors) | Rewind: Sentinel-1 C-band vs NISAR L-band |
| Supplemental optical and GIS layers | Rewind: Landsat. Optional GIBS layer |
| Human drivers | Site A story |
| Hypothesize physical drivers | Story captions per site (section 7) |
| Hometown and personal context | Site A (Abu Dhabi) |
| Open source, accessible to broad audience | MIT license, public repo, plain-language UI, Lab |
| Future NISAR applications | Closing story beat + README |

Judging criteria (Space Apps standard): **Impact, Creativity, Validity, Relevance, Presentation**.
Validity is where most pretty demos lose points. See rules in section 10.

---

## 2. Assumptions (confirm or correct at kickoff)

- Builder: one person plus Claude Code. If teammates exist, give them track B (section 9) or the story/demo.
- Budget: about 20 working hours. Deadline is expected to be **Sunday 15 Nov, 23:59 local**. Human must verify in the 2026 Project Submission Guide.
- No backend. Everything is static files. Data is baked offline by a Python pipeline and committed.
- Human has (or will create in 5 minutes) a free NASA Earthdata Login.

---

## 3. Verified facts to build on

Do not re-derive these. Do verify anything not listed here before relying on it.

**NISAR instrument (use in Lab presets and copy)**
- L-band, about 24 cm wavelength (1.25 GHz). S-band, about 9.4 cm (3.2 GHz), mainly acquired over India, hosted by ISRO Bhoonidhi.
- Orbit 747 km, 98.4 deg inclination, 12-day exact repeat, swath over 240 km, left-looking, 12 m reflector, SweepSAR.
- L-band bandwidth modes (MHz): 77, 40+5, 20+5, 20+20, 5+5. Along-track resolution about 7 m, cross-track 2 to 8 m by mode.

**NISAR data availability at ASF DAAC (as of Nov 2026)**

| Tier | Acquisition dates | Use it for |
|---|---|---|
| VALIDATED | 21 Oct 2026 onward (L0 to L2) | Quantitative analysis |
| PROVISIONAL | 17 Jun 2026 to about 23 Oct 2026 (L0 to L3) | Quantitative analysis |
| BETA | subset of 17 Oct 2025 to 20 Jan 2026, pre-calibration, max 8 acquisitions per track | Visual context only, flagged in UI |

- Permanent data gap: 27 Jul 2026 to 10 Aug 2026.
- Mixing BETA with PROVISIONAL can introduce processing differences. Never put BETA scenes in change statistics.
- Where VALIDATED and PROVISIONAL overlap (21 to 23 Oct), keep VALIDATED.
- Expect at most about 11 to 12 scenes per track for Jun to Nov 2026.

**Access**
- Search: `asf_search` Python package. `asf.search(dataset='NISAR', processingLevel='GCOV', intersectsWith=<WKT>, start=..., end=...)`.
- Auth: Earthdata Login (bearer token or `.netrc`).
- Format: HDF5. GCOV rasters live at `/science/LSAR/GCOV/grids/frequencyA/{HHHH,HVHV,...}` with `xCoordinates`, `yCoordinates`, `projection` (attr `epsg_code`), `mask`, `numberOfLooks`, `rtcGammaToSigmaFactor`.
- GCOV is terrain-corrected gamma0 backscatter power. Label values as "γ0 (dB)".
- Full scenes are huge (example grid: 36720 x 37080). **Stream an AOI subset over HTTPS, do not download whole files** unless streaming fails.
- Reference notebooks (copy patterns from these): NISAR Cookbook
  - https://asfopensarlab.github.io/NISAR_Cookbook/notebooks/search-stream-nisar-gcov-asf-search
  - https://asfopensarlab.github.io/NISAR_Cookbook/notebooks/nisar-gcov-time-series-example
  - https://asfopensarlab.github.io/NISAR_Cookbook/notebooks/opening-hdf5-python
- Docs: https://nisar-docs.asf.alaska.edu/ (see `/gcov`, `/asf-search`, `/availability-overview`, `/nisar-known-issues`).

**Other sensors**
- Sentinel-1 RTC on Microsoft Planetary Computer: STAC collection `sentinel-1-rtc`, Oct 2014 onward, VV/VH COGs. **Needs a Planetary Computer account for SAS tokens.** Fallback order in section 5.3.
- Landsat Collection 2 Level-2 on Planetary Computer: STAC collection `landsat-c2-l2`.

**Unverified, test before relying on**
- A titiler-cmr endpoint at `openveda.cloud/api/titiler-cmr` appears to serve NISAR GCOV as XYZ tiles directly
  (`collection_concept_id=C3622214170-ASF`, `variables=HHHH`, `group=science/LSAR/GCOV/grids/frequencyB`, `temporal=...`).
  If it works without auth from a browser, it enables a zero-bake "anywhere on Earth" layer (stretch S2). Spend 15 minutes max testing it.

---

## 4. Architecture

```
repo/
  PLAN.md  README.md  LICENSE (MIT)
  pipeline/                  Python 3.11, runs offline, never deployed
    requirements.txt         asf_search h5py fsspec aiohttp xarray rioxarray rasterio numpy pillow pyyaml pystac-client planetary-computer
    sites.yaml               AOIs and metadata
    coverage.py              step 0: what NISAR data exists per site
    bake_nisar.py            GCOV subsets  -> quantized PNG + manifest entries
    bake_s1.py               Sentinel-1    -> same format
    bake_optical.py          Landsat       -> RGB JPEG per year
    bake_insar.py            (stretch) GUNW -> displacement PNG
    common.py                warp, quantize, manifest IO
  web/                       Vite + React + TypeScript
    public/data/<site>/      baked output, committed
      manifest.json
      nisar/<YYYYMMDD>_<pol>.png
      s1/<YYYYMM>_<pol>.png
      optical/<YYYY>.jpg
    src/
      sim/                   pure TS, no DOM. worker.ts fft.ts scene.ts echo.ts focus.ts insar.ts presets.ts *.test.ts
      map/                   MapView.tsx decode.ts render.ts change.ts colormaps.ts
      modes/                 Lab.tsx Explore.tsx Rewind.tsx Story.tsx
      story/                 <site>.json beats
      ui/                    shared controls, Timeline, Chart
```

Stack: Vite, React, TypeScript, MapLibre GL JS (free no-key basemap), Vitest. Charts: uPlot or hand-rolled canvas.
State: plain React state or Zustand. Deploy: GitHub Pages via Actions (or Vercel). Three.js only if stretch S3 is reached.

### Why baked data
NISAR files are large HDF5 behind a login. A browser cannot read them in a hackathon timeframe.
Baking small AOI rasters gives instant load, offline demo safety, and lets all change math run client-side.

### Baked raster format (the contract between pipeline and web)

- Projection: **EPSG:3857**, so a MapLibre `canvas`/`image` source with four corner coordinates aligns exactly.
- Grid: same shape and bounds for every raster of a site (all sensors, all dates). Target about 30 m pixels, max 1200 x 1200.
- Radar: single-channel 8-bit PNG. `0 = nodata`. `v = 1 + round((dB + 35) / 40 * 254)`, so 1..255 maps to -35..+5 dB (0.16 dB steps).
  Decode: `dB = (v - 1) / 254 * 40 - 35`.
- Optical: RGB JPEG quality 85, same grid.
- Before quantizing radar: mask invalid, convert power to dB (`10*log10`), light speckle reduction by multilooking to the target grid (average in power, not dB).

`manifest.json`:

```json
{
  "id": "abu-dhabi",
  "name": "Abu Dhabi coast",
  "bounds3857": [xmin, ymin, xmax, ymax],
  "cornersLngLat": [[lng,lat],[lng,lat],[lng,lat],[lng,lat]],
  "shape": [rows, cols],
  "db": {"min": -35, "max": 5},
  "layers": [
    {"sensor": "NISAR", "band": "L", "date": "2026-06-21", "pol": "HH", "tier": "PROVISIONAL",
     "track": 172, "frame": 8, "direction": "A", "file": "nisar/20260621_HH.png",
     "granule": "NISAR_L2_PR_GCOV_...", "incidenceDeg": 38.2},
    {"sensor": "S1", "band": "C", "date": "2019-07", "pol": "VV", "file": "s1/201907_VV.png"},
    {"sensor": "Landsat", "date": "1990", "file": "optical/1990.jpg"}
  ]
}
```

Every NISAR layer keeps its granule name so the app can show provenance and link to ASF. This matters for Validity.

---

## 5. Data pipeline

### 5.0 Step zero: coverage check (gate for site choice)

`python pipeline/coverage.py` reads `sites.yaml`, queries ASF for GCOV (and GUNW for site C), and prints per site:
date, tier, track, frame, direction, polarizations, granule. Then a summary: best single track+frame+direction stack and its scene count.

**Site selection rule:** a site is usable if one track+frame+direction has at least 6 PROVISIONAL/VALIDATED GCOV dates with dual-pol (HH+HV).
Never mix tracks or directions in one time series (different look geometry changes backscatter).

**Human gate 1:** human reviews the table and confirms sites.

### 5.1 Candidate sites (`sites.yaml`)

| ID | Where | Change type | What to look for | Status |
|---|---|---|---|---|
| A `abu-dhabi` | Abu Dhabi islands, mangroves, desert edge (about 24.45 N, 54.45 E, 35 x 35 km) | Human-driven: coastal reclamation, urban growth, mangrove planting | Double-bounce (HH) from new buildings, HV from mangrove canopy, dark smooth sand vs rough surfaces. Rewind shows 40 years of coastline change | Primary, hometown |
| B `kosi` | Kosi River floodplain, Bihar, India (about 26.1 N, 86.55 E, 40 x 40 km, moved west from 86.9 E onto the river channel on 15 Nov) | Natural: monsoon inundation and retreat, Jun to Oct | Open water goes dark, flooded vegetation goes bright in HH (double bounce). Optical is cloud-blind in monsoon, radar is not | Primary |
| C `venezuela-eq` | Area of the 24 Jun 2026 Venezuela earthquakes (look up USGS epicenters) | Deformation, InSAR | GUNW unwrapped phase, fringes. Needs a pre-event scene between 17 and 24 Jun on the same track, which is not guaranteed | Stretch S1 |
| D backup | Amazon deforestation front or any glacier | Forest loss (HV drop) or ice motion | Use only if A or B fails the coverage rule | Backup |

Do not assume an event happened. For site B, the pipeline output decides what the story says (see rules, section 10).

### 5.2 `bake_nisar.py`

1. Search GCOV for the chosen track/frame stack. Drop `QA_STATS` files. Dedupe tiers.
2. For each granule: open over HTTPS with `fsspec` + bearer token (Cookbook streaming pattern), read `projection` EPSG and coordinate vectors, compute the AOI window, read only that window for `HHHH` and `HVHV` (and `VVVV` if present) from `frequencyA`.
3. Apply `mask`. Convert to dB. Reproject and resample to the site grid (average resampling in power domain).
4. Write PNGs, append manifest entries, print min/median/max dB per layer as a sanity log.
5. Also write `web/public/data/<site>/stats.json`: per-date AOI median dB per pol (for the overview chart).

Sanity checks to print and eyeball: water around -20 dB or lower in HV, urban well above -10 dB in HH, no all-zero layers, grids identical across dates.

### 5.3 `bake_s1.py` (Rewind radar history)

Goal: one VV and one VH raster per site for each year 2015 to 2026, same month each year (site A: any dry month; site B: peak monsoon, plus one dry-season month).
Source fallback order, stop at the first that works within 30 minutes:
1. Planetary Computer `sentinel-1-rtc` (needs PC account token).
2. Planetary Computer `sentinel-1-grd` (not terrain-corrected; acceptable on flat sites A and B, say so in the UI).
3. ASF OPERA RTC-S1 or HyP3 on-demand RTC via Earthdata Login.

Use a temporal median of 2 to 4 scenes from one relative orbit to suppress speckle. Same grid and quantization as NISAR.

### 5.4 `bake_optical.py` (Rewind optical history)

Landsat `landsat-c2-l2` from Planetary Computer. One cloud-filtered median true-color composite per site every 2 to 5 years from 1985 to 2025
(Landsat 5 TM, 7 ETM+, 8/9 OLI). Apply scale/offset, gamma stretch, write JPEG on the site grid.
For site B also bake one **peak-monsoon** optical scene from 2026 as-is, clouds included, to show why radar matters.

### 5.5 Size budget

Target under 80 MB total baked data. If over: shrink AOI first, then drop S1 years, never drop NISAR dates.

---

## 6. Web app spec

### 6.1 Shared map and render core (`src/map`)

- `decode.ts`: load PNG, draw to offscreen canvas, return `Uint8Array` of values. Cache per layer.
- `render.ts`: given 1 to 3 decoded layers and a render mode, fill an RGBA `ImageData` for a canvas that backs a MapLibre `canvas` source.
  Modes: `gray` (single pol, adjustable dB stretch), `polRGB` (R = HH, G = HV, B = HH minus HV in dB), `temporalRGB` (R = date 1, G = B = date 2: red = lost brightness, cyan = gained),
  `logRatio` (date 2 dB minus date 1 dB, diverging colormap, threshold slider, pixels under threshold transparent).
- `change.ts`: log ratio, per-pixel temporal mean / std / coefficient of variation across the stack, region mean time series.
- Colormaps: perceptually uniform, colorblind-safe diverging map for change. Always show a legend with units.

### 6.2 Explore mode (core)

Layout: map center, timeline bottom, panel right.

- Site picker. Timeline with one tick per NISAR date, gap period shaded and labeled "no data (mission gap)". Play button animates dates.
- Polarization toggle: HH, HV, pol RGB. Short plain-language hint per choice ("HV lights up vegetation volume").
- Compare: pick date 1 and date 2. Views: swipe slider, temporal RGB, log-ratio change map.
- Inspect: click a pixel or draw a rectangle → chart of γ0 dB vs date for HH and HV. Show the numbers.
- "Most changed" overlay: coefficient of variation across the stack, to guide the eye.
- Provenance drawer: granule names, tier, track/frame, link to ASF, calibration note.
- Every view has a one-sentence "what am I looking at" caption.

Acceptance: with site A loaded, a first-time user can find a changed area and read its time series in under 30 seconds without instructions.

### 6.3 Rewind mode

- One long timeline, 1985 to 2026, with three sensor lanes: Landsat optical, Sentinel-1 C-band, NISAR L-band. Lanes show where each sensor has data.
- Scrubbing shows the best available layer for that time. Split view option: optical left, radar right.
- "Same month, two radars" card: Sentinel-1 C-band vs NISAR L-band for the closest dates in 2026, with the wavelength explanation (L-band penetrates canopy and dry sand more than C-band).
- Clear labels: sensor, band, wavelength, date. Never present Sentinel-1 or Landsat as NISAR.

### 6.4 Lab mode (SAR physics simulator)

All sim code is pure TypeScript in `src/sim`, runs in a Web Worker, uses `Float32Array` interleaved complex, SI units throughout.

**Geometry.** Stripmap, flat Earth, straight track. Platform position `P_n = (x_n, 0, H)`, `x_n = n * d`. Scatterer `k` at `(x_k, y_k, z_k)` with complex amplitude `A_k`.
Slant range `R_nk = |P_n - S_k|`.

**Signal model (baseband).**
```
s(n, τ) = Σ_k  A_k · w(n,k) · p(τ - 2 R_nk / c) · exp(-j 4π R_nk / λ)
p(τ)    = rect(τ / T_p) · exp(j π K τ²),   K = B / T_p
```
`w(n,k)` is the antenna azimuth pattern (start with a rectangular beam of width `λ / L_ant`).

**Fast echo generation.** Do not loop over chirp samples per scatterer. For each pulse:
1. Build the ideal range profile: add each scatterer at its fractional range bin with an 8-tap windowed-sinc kernel, times `exp(-j 4π R / λ)`.
2. Raw echo = IFFT( FFT(profile) · FFT(chirp) ). This is the "what the radar records" view.

**Range compression.** Matched filter: multiply the raw spectrum by `conj(FFT(chirp))`, optional Hamming window. Zero-pad x4 in frequency for upsampling before focusing.

**Azimuth focusing: time-domain backprojection (default).**
```
I(x, y) = Σ_n  rc(n, τ = 2 R_n(x,y,0) / c) · exp(+j 4π R_n(x,y,0) / λ)
```
Linear interpolation in the upsampled range axis. Exact for any geometry, simple to get right.
Accumulate pulse by pulse and post partial images to the UI, so the user **watches the image sharpen as the synthetic aperture grows**. This is the hero interaction.
Range-Doppler algorithm with RCMC is optional (stretch S4), only as a "how real processors do it fast" tab.

**Sampling rules (auto-computed, capped).**
- Range: `f_s = 1.25 B`. Range resolution `c / (2B)`.
- Azimuth: pulse spacing `d ≤ λ / (4 sin θ_max)` where `θ_max` is the largest angle from broadside to any scene point over the aperture. Cap at 1024 pulses, shrink the aperture and tell the user if capped.
- Azimuth resolution `≈ λ R / (2 L_sa)`.

**Default preset: scaled scene** (keeps arrays small with true wavelengths): `H = 5 km`, incidence 40 deg, `v = 100 m/s`, scene 400 x 400 m, `B = 40 MHz`, `T_p = 2 µs`, `L_sa` slider 10 to 300 m, image grid 200 x 200.
Show a side panel "the real NISAR": 747 km altitude, 12 m antenna, about 24 cm wavelength, 240 km swath, with the same formulas evaluated for the real numbers.
State in the UI that the Lab is scaled.

**Stages shown, left to right:** scene (ground truth) → raw echoes (looks like noise) → range-compressed (hyperbolas) → focused image.

**Scene builder.** Presets plus paint tools:
- Single point target (corner reflector): the impulse response, the cleanest lesson.
- Two close targets: resolution demo, pull them apart with bandwidth and aperture sliders.
- Coastline: land, calm water, a few ships.
- City block: buildings with height.
- Forest and field.

Distributed surfaces = several sub-scatterers per resolution cell at random sub-positions with random phase. Speckle then emerges by itself.

**Lessons, in build order (each is a labeled panel with 1 to 3 controls):**

| # | Lesson | Control | What the user sees |
|---|---|---|---|
| L1 | Synthetic aperture | aperture length | azimuth blur collapses to a point |
| L2 | Bandwidth | B slider | range resolution `c/2B` |
| L3 | Wavelength | L / S / C / X buttons | same aperture, different resolution; longer λ needs a longer aperture |
| L4 | Speckle and multilooking | looks 1 to 16 | grain fades, detail fades with it |
| L5 | Two-pass change detection | edit scene (flood a field), rerun | log-ratio map, **same colormap and code as Explore** |
| L6 | Roughness and dielectric | surface RMS height, soil moisture | smooth water goes dark; wet soil brightens |
| L7 | Polarization | HH / HV / VV / RGB | buildings bright in HH, forest bright in HV |
| L8 | InSAR | displacement in cm, decorrelation | fringes, one per `λ/2` of line-of-sight motion (about 12 cm at L-band, 2.8 cm at C-band) |
| L9 | Layover and shadow | building height, incidence angle | tall targets lean toward the radar |

Models for L6 and L7 are **stylized**, and the UI must say so:
- Roughness: `σ ∝ 1 - exp(-(2 k h cos θ)²)`, `k = 2π/λ` (smooth when `h` is well under `λ / (8 cos θ)`).
- Moisture: Fresnel power reflectivity `|(1-√ε)/(1+√ε)|²`, `ε` from 3 (dry) to 30 (wet), water 80.
- Polarization amplitude table per scatterer class (HH, HV, VV): rough surface (1.0, 0.15, 1.1), double bounce (1.6, 0.1, 1.0), volume (0.7, 0.5, 0.7), calm water (0.03, 0.01, 0.03).
- Canopy: two-way attenuation that is weaker at longer wavelength, so L-band shows ground and trunks, C/X-band shows canopy top.

L8 implementation: run two passes with identical sub-scatterer phases, move scatterers by `Δ` along line of sight between passes, interferogram `= I1 · conj(I2)`.
Decorrelation slider jitters sub-scatterer positions by `σ_d`; coherence falls faster at short wavelength. That is physical, not stylized.

L9: layover falls out of backprojection onto `z = 0`. Shadow needs an occlusion pass over the height map per azimuth column; do it last.

**Handoff button in every lesson:** "See this in real NISAR data →" deep-links to Explore with the matching site, dates, and render mode
(L5 → site B change map, L7 → site A pol RGB, L8 → site C if built).

**Tests (Vitest, required, these are the Validity evidence):**
- FFT round trip and known transform.
- Point target: peak within 0.5 px of truth; -3 dB width in range within 15% of `0.886 c/(2B)` and in azimuth within 15% of `0.886 λR/(2 L_sa)` (unweighted).
- Peak sidelobe near -13 dB unweighted.
- InSAR: fringe count across a linear ramp matches `2 Δ_max / λ` within 1.
- Performance: default preset focuses in under 2 s on a laptop.

Put the measured-vs-theory numbers in the README.

### 6.5 Story mode

Guided tour per site, 4 to 6 beats, each beat = `{title, text, mode, site, dates, render, camera, highlightRegion}` in `src/story/<site>.json`.
Required beats per site: where and why this place → what radar shows (which pol, why) → the change (with a number from the data) → hypothesis on the physical or human driver → what NISAR adds going forward.
Landing page opens with the three-mode pitch and a "Start the tour" button.

---

## 7. Content that needs a human

- Site A personal context: two or three sentences from someone who lives there. Human writes.
- All hypothesis captions: Claude Code drafts from the baked data and marks them `DRAFT`; human reads against the map and approves.
- Team name, project title, 30-second demo script.

---

## 8. Stretch goals (only after M5 is green)

| ID | Item | Est. |
|---|---|---|
| S1 | Site C InSAR: bake GUNW unwrapped phase → LOS displacement (`-λ φ / 4π`), fringe view | 3 h |
| S2 | "Anywhere" mode via titiler-cmr live NISAR tiles, if section 3 test passed | 2 h |
| S3 | 3D orbit and beam geometry view (Three.js) in Lab | 2 h |
| S4 | Range-Doppler algorithm tab | 2 h |
| S5 | NISAR S-band over India from Bhoonidhi for site B | 2 h |

---

## 9. Schedule (20 h, two parallel tracks)

Track A (data + map) and track B (Lab) share no code until M4. Run them as **two Claude Code sessions in separate git worktrees**, or give track B to a teammate.

| Hours | Track A | Track B |
|---|---|---|
| 0 to 1 | **M0** scaffold, deploy "hello" to public URL, `coverage.py`. Human gate 1 | sim folder, FFT + tests |
| 1 to 4 | **M1** `bake_nisar.py` for sites A and B, manifests committed | **B1** echo, range compression, backprojection, point-target tests passing |
| 4 to 8 | **M2** Explore: render core, timeline, pol toggle, compare views, pixel chart | **B2** Lab UI: four-stage view, progressive focusing, presets, L1 to L3 |
| 8 to 11 | **M3** `bake_s1.py`, `bake_optical.py`, Rewind mode | **B3** L4 to L8 |
| 11 to 14 | **M4** merge tracks, Story mode, landing page, Lab → Explore deep links | (joined) |
| 14 to 17 | **M5** polish: captions, legends, mobile layout, load performance, README, provenance, license, AI-use note | (joined) |
| 17 | **Code freeze.** Only bug fixes after this | |
| 17 to 20 | **M6** human: demo video or slides, project page, submit with margin | |

### Cut order when behind
1. Stretch items. 2. L9, then L7, then L6. 3. Landsat before 2014. 4. Sentinel-1 lane (keep one C vs L comparison card). 5. Site B.

### Never cut
- Explore with at least one site, NISAR time series, change map, pixel chart.
- Lab L1 (raw → focused with aperture scrub) with passing point-target test.
- Public URL, public repo, README, demo.

### Definition of done per milestone
A milestone is done when it is deployed to the public URL and the acceptance line for that mode holds. Commit and push at every milestone.

---

## 10. Rules for Claude Code

1. **No invented findings.** Every statement about what changed at a site must be backed by the baked data (print the numbers). If the data shows nothing, say that and offer a hypothesis for why. The brief explicitly allows "or don't see".
2. **No invented data.** If a download fails, stop and report. Never synthesize a "placeholder" raster that could be mistaken for NISAR. Lab output is always labeled "simulated".
3. **Label sensors and calibration tiers** everywhere real data appears. BETA scenes get a visible "pre-calibration" tag.
4. **Stylized models are labeled stylized.** The echo/focusing chain is real physics; the scattering tables are not calibrated.
5. One track, one direction per time series.
6. No secrets in the repo. Earthdata token from env var `EARTHDATA_TOKEN` or `~/.netrc`.
7. Keep the sim core free of DOM and React so tests run in Node.
8. Ask the human only at the listed gates: (1) site choice after coverage, (2) data source fallback if all Sentinel-1 routes fail, (3) caption approval, (4) before cutting anything in "never cut".
9. Prefer finishing and deploying a smaller thing over starting a larger one. Check the clock against section 9 at each milestone.
10. Verify library APIs and any NISAR detail not in section 3 from the linked docs instead of guessing.

---

## 11. Human checklist

- [ ] Create/confirm Earthdata Login at urs.earthdata.nasa.gov, generate a bearer token, export `EARTHDATA_TOKEN`.
- [ ] (Optional) Planetary Computer account for Sentinel-1 RTC.
- [ ] Confirm sites after `coverage.py` (gate 1).
- [ ] Write site A personal context.
- [ ] Approve captions (gate 3).
- [ ] Read the **2026 Project Submission Guide** and Participant FAQ: exact deadline, required project-page fields, AI-use disclosure rules, and limits on showing participants under 18 in the demo. A screen recording with English captions and no faces or voices avoids the last issue.
- [ ] Demo: video of 30 seconds max with English subtitles, or 7 slides max including title. Host on a public link.
- [ ] Project page: summary, demo link, repo link, NASA data used (list NISAR GCOV via ASF DAAC, plus Sentinel-1, Landsat, any GIBS layers), tools, AI use.
- [ ] Submit at least one hour before the deadline.

Suggested 30-second demo: 0 to 5 s title and one-line pitch · 5 to 12 s Lab, aperture scrub turning noise into an image · 12 to 22 s Explore, site flood or coast change with chart · 22 to 27 s Rewind, 40 years in a scrub · 27 to 30 s URL and "built on NISAR".

---

## 12. Kickoff prompts

**Session A (data + map), repo root:**
> Read PLAN.md fully. You own track A. Do M0 now: scaffold the repo per section 4, set up GitHub Pages deploy, write pipeline/sites.yaml and pipeline/coverage.py per section 5.0 and 5.1, run it, and show me the coverage table. Stop at human gate 1. Follow the rules in section 10. Test the titiler-cmr endpoint from section 3 for 15 minutes max and report.

**Session B (Lab), separate worktree:**
> Read PLAN.md fully. You own track B, section 6.4 only. Build src/sim as pure TypeScript with Vitest: fft.ts, scene.ts, echo.ts, focus.ts, in that order, each with the tests listed. Do not build UI until the point-target tests pass and you have printed measured vs theoretical resolution. Then build the Lab UI through lesson L3 and stop for review.
