import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, ImageSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre v6 loads its worker from a sibling file next to its module, which Vite moves when bundling.
// Emitting the self-contained worker as an asset and pointing MapLibre at it works in dev and in the build.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { lngLatToPixel, loadManifest, loadRaster, pixelToLngLat, type Layer, type Manifest } from '../map/decode'
import { coefVariation, logRatio, rectPixels, regionSeries } from '../map/change'
import { renderDiverging, renderGray, renderPolRGB, renderSequential, renderTemporalRGB, type Stretch } from '../map/render'
import { DIVERGING, SEQUENTIAL, cssGradient } from '../map/colormaps'
import { Chart } from '../ui/Chart'
import { Timeline } from '../ui/Timeline'

import { SITES, rememberSite, siteOr } from '../sites'
import { BASEMAP, labelsAbove } from '../map/basemap'

maplibregl.setWorkerUrl(workerUrl)

const STRETCH: Record<P, Stretch> = { HH: [-25, 0], HV: [-32, -8] }
const COLORS: Record<P, string> = { HH: '#f2a541', HV: '#4fc3c8' }

type P = 'HH' | 'HV'
type Pol = P | 'RGB'
type View = 'single' | 'swipe' | 'temporal' | 'change'
type Scene = { date: string; HH?: Layer; HV?: Layer; flag?: string; tier?: string }
type Box = [number, number, number, number] // r0, c0, r1, c1

const POL_HINT: Record<Pol, string> = {
  HH: 'HH sends and receives horizontally. Buildings and flooded trees light up through double bounce.',
  HV: 'HV is cross-polarized. It lights up vegetation volume like mangrove canopy and crops.',
  RGB: 'Red is HH, green is HV, blue is HH minus HV. Buildings read yellow to pink, vegetation green, smooth sand and calm water near black.',
}
const VIEW_HINT: Record<View, string> = {
  single: 'NISAR L-band radar backscatter for one date. Brighter means more energy came back to the satellite.',
  swipe: 'Left of the split is the "before" date, right is the selected date. Drag the slider to compare.',
  temporal: 'Red is the before date, cyan the selected date. Red areas got darker, cyan areas got brighter, gray is unchanged.',
  change: 'Change in backscatter between the two dates. Red got darker, blue got brighter. Small changes are hidden.',
}

function scenesOf(m: Manifest): Scene[] {
  const by = new Map<string, Scene>()
  for (const l of m.layers) {
    if (l.sensor !== 'NISAR' || (l.pol !== 'HH' && l.pol !== 'HV')) continue
    const s = by.get(l.date) ?? { date: l.date, tier: l.tier }
    s[l.pol] = l
    s.flag ??= l.flag
    by.set(l.date, s)
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const asfLink = (g: string) => `https://search.asf.alaska.edu/#/?searchType=List%20Search&searchList=${g}&resultsLoaded=true`

export default function Explore({ initialSite }: { initialSite?: string }) {
  const [site, setSite] = useState(() => siteOr(initialSite))
  const [m, setM] = useState<Manifest>()
  const [error, setError] = useState<string>()
  const [pol, setPol] = useState<Pol>('HH')
  const [view, setView] = useState<View>('single')
  const [idx, setIdx] = useState(0)
  const [before, setBefore] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [threshold, setThreshold] = useState(3)
  const [swipe, setSwipe] = useState(0.5)
  const [stretch, setStretch] = useState(STRETCH)
  const [cvOn, setCvOn] = useState(false)
  const [cvThr, setCvThr] = useState(0.6)
  const [box, setBox] = useState<Box>()
  const [series, setSeries] = useState<Record<P, number[]>>()
  const [drawer, setDrawer] = useState(false)
  const [ready, setReady] = useState(false)
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map>(null)
  const cvCache = useRef(new Map<string, Float32Array>())

  const sc = useMemo(() => (m ? scenesOf(m) : []), [m])
  const flagged = useMemo(() => sc.map((s) => !!s.flag), [sc])
  const p1: P = pol === 'HV' ? 'HV' : 'HH' // change views use one polarization
  const cur = sc[idx]

  // Map, once.
  useEffect(() => {
    const map = new maplibregl.Map({ container: mapDiv.current!, style: BASEMAP, center: [54.45, 24.45], zoom: 9, boxZoom: false })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.on('load', () => setReady(true))
    mapRef.current = map
    return () => map.remove()
  }, [])

  // Site manifest.
  useEffect(() => {
    setM(undefined); setBox(undefined); setSeries(undefined); setError(undefined); setPlaying(false)
    loadManifest(site).then((mf) => {
      const n = scenesOf(mf).length
      setM(mf); setIdx(n - 1); setBefore(0)
    }).catch((e) => setError(`Could not load ${site}: ${e.message}`))
  }, [site])

  // Image sources follow the site grid.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !m) return
    const firstSymbol = labelsAbove(map)
    for (const id of ['radar', 'overlay']) {
      const src = map.getSource(id) as ImageSource | undefined
      if (src) src.setCoordinates(m.cornersLngLat)
      else {
        map.addSource(id, { type: 'image', coordinates: m.cornersLngLat } as maplibregl.ImageSourceSpecification)
        map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-fade-duration': 0 } }, firstSymbol)
      }
    }
    if (!map.getSource('sel')) {
      map.addSource('sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'sel', type: 'line', source: 'sel', paint: { 'line-color': '#fff', 'line-width': 2 } })
    }
    const [tl, , br] = m.cornersLngLat
    map.fitBounds([tl, br], { padding: 30, duration: 0 })
  }, [m, ready])

  // Main radar render.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !m || !cur) return
    let stale = false
    const [rows, cols] = m.shape
    const get = (s: Scene, p: P) => loadRaster(m.id, s[p]!.file)
    const draw = async (s: Scene, out: Uint8ClampedArray) =>
      pol === 'RGB' ? renderPolRGB(await get(s, 'HH'), await get(s, 'HV'), out) : renderGray(await get(s, p1), out, stretch[p1])
    ;(async () => {
      const img = new ImageData(cols, rows)
      const bef = sc[before]
      if (view === 'change') renderDiverging(logRatio(await get(bef, p1), await get(cur, p1)), img.data, threshold)
      else if (view === 'temporal') renderTemporalRGB(await get(bef, p1), await get(cur, p1), img.data, stretch[p1])
      else {
        await draw(cur, img.data)
        if (view === 'swipe') {
          const left = new ImageData(cols, rows)
          await draw(bef, left.data)
          const split = Math.round(swipe * cols) * 4
          for (let r = 0; r < rows; r++) img.data.set(left.data.subarray(r * cols * 4, r * cols * 4 + split), r * cols * 4)
        }
      }
      if (!stale) (map.getSource('radar') as ImageSource | undefined)?.updateImage({ image: img })
    })().catch((e) => setError(e.message))
    return () => { stale = true }
  }, [m, ready, cur, before, sc, pol, p1, view, threshold, swipe, stretch])

  // "Most changed" overlay: coefficient of variation over unflagged dates.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !m || !map.getLayer('overlay')) return
    map.setLayoutProperty('overlay', 'visibility', cvOn ? 'visible' : 'none')
    if (!cvOn) return
    let stale = false
    ;(async () => {
      const key = `${m.id}/${p1}`
      let cv = cvCache.current.get(key)
      if (!cv) {
        const use = sc.filter((s) => !s.flag && s[p1])
        cv = coefVariation(await Promise.all(use.map((s) => loadRaster(m.id, s[p1]!.file))))
        cvCache.current.set(key, cv)
      }
      const img = new ImageData(m.shape[1], m.shape[0])
      renderSequential(cv, img.data, cvThr, 2)
      if (!stale) (map.getSource('overlay') as ImageSource).updateImage({ image: img })
    })().catch((e) => setError(e.message))
    return () => { stale = true }
  }, [m, ready, sc, cvOn, cvThr, p1])

  // Click a pixel (3 x 3 box) or shift-drag a rectangle to inspect.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !m) return
    const [rows, cols] = m.shape
    let start: [number, number] | null = null
    const clamp = (b: Box): Box => [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(rows - 1, b[2]), Math.min(cols - 1, b[3])]
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.shiftKey) return
      const p = lngLatToPixel(m, e.lngLat.lng, e.lngLat.lat)
      if (p) setBox(clamp([p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1]))
    }
    const onDown = (e: maplibregl.MapMouseEvent) => {
      if (!e.originalEvent.shiftKey) return
      start = lngLatToPixel(m, e.lngLat.lng, e.lngLat.lat)
      if (start) map.dragPan.disable()
    }
    const onUp = (e: maplibregl.MapMouseEvent) => {
      if (!start) return
      const end = lngLatToPixel(m, e.lngLat.lng, e.lngLat.lat) ?? start
      setBox(clamp([Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1])]))
      start = null
      map.dragPan.enable()
    }
    map.on('click', onClick); map.on('mousedown', onDown); map.on('mouseup', onUp)
    return () => { map.off('click', onClick); map.off('mousedown', onDown); map.off('mouseup', onUp) }
  }, [m])

  // Selection outline and its time series.
  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource('sel') as GeoJSONSource | undefined
    if (!m || !box) { src?.setData({ type: 'FeatureCollection', features: [] }); return }
    const [r0, c0, r1, c1] = box
    const ring = [[r0, c0], [r0, c1 + 1], [r1 + 1, c1 + 1], [r1 + 1, c0], [r0, c0]].map(([r, c]) => pixelToLngLat(m, r, c))
    src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } })
    let stale = false
    const px = rectPixels(m.shape[1], r0, c0, r1, c1)
    Promise.all((['HH', 'HV'] as P[]).map(async (p) =>
      regionSeries(await Promise.all(sc.map((s) => loadRaster(m.id, s[p]!.file))), px),
    )).then(([hh, hv]) => !stale && setSeries({ HH: hh, HV: hv })).catch((e) => setError(e.message))
    return () => { stale = true }
  }, [m, box, sc])

  // Play through dates.
  useEffect(() => {
    if (!playing || !sc.length) return
    const t = setInterval(() => setIdx((i) => (i + 1) % sc.length), 900)
    return () => clearInterval(t)
  }, [playing, sc.length])

  const boxSizeM = box && m ? Math.round(((box[3] - box[1] + 1) * (m.bounds3857[2] - m.bounds3857[0])) / m.shape[1] * Math.cos(((m.cornersLngLat[0][1] + m.cornersLngLat[3][1]) / 2) * Math.PI / 180)) : 0
  const compare = view !== 'single'

  return (
    <div className="explore">
      <header className="bar">
        <h1>Radar Waltz <span>Explore</span></h1>
        <nav><a href="#">Globe</a> · <a href={`#explore/${site}`} aria-current="page">Explore</a> · <a href={`#rewind/${site}`}>Rewind</a></nav>
        <label>Site{' '}
          <select value={site} onChange={(e) => { setSite(e.target.value); rememberSite('explore', e.target.value) }}>
            {SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <span className="sensor">NISAR L-band, γ0 backscatter (dB)</span>
      </header>

      <div ref={mapDiv} className="map" />

      <aside className="panel">
        {error && <p className="error" role="alert">{error}</p>}
        {cur && (
          <p className="now-date">
            <strong>{cur.date}</strong> <span className={`tier ${cur.tier?.toLowerCase()}`}>{cur.tier}</span>
            {cur.flag && <span className="flag-note">Flagged: {cur.flag}</span>}
          </p>
        )}

        <section>
          <h2>Polarization</h2>
          <div className="seg" role="radiogroup">
            {(['HH', 'HV', 'RGB'] as Pol[]).map((p) => (
              <button key={p} aria-pressed={pol === p} onClick={() => setPol(p)}>{p === 'RGB' ? 'Pol RGB' : p}</button>
            ))}
          </div>
          <p className="hint">{POL_HINT[pol]}</p>
          {pol !== 'RGB' && view !== 'change' && (
            <label className="row">Stretch {stretch[p1][0]} to {stretch[p1][1]} dB
              <input type="range" min={-35} max={-5} value={stretch[p1][0]}
                onChange={(e) => setStretch({ ...stretch, [p1]: [+e.target.value, stretch[p1][1]] })} aria-label="Stretch low dB" />
              <input type="range" min={-20} max={5} value={stretch[p1][1]}
                onChange={(e) => setStretch({ ...stretch, [p1]: [stretch[p1][0], +e.target.value] })} aria-label="Stretch high dB" />
            </label>
          )}
        </section>

        <section>
          <h2>Compare</h2>
          <div className="seg">
            {(['single', 'swipe', 'temporal', 'change'] as View[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                {{ single: 'One date', swipe: 'Swipe', temporal: 'Temporal RGB', change: 'Change map' }[v]}
              </button>
            ))}
          </div>
          {compare && (
            <label className="row">Before{' '}
              <select value={before} onChange={(e) => setBefore(+e.target.value)}>
                {sc.map((s, i) => <option key={s.date} value={i}>{s.date}{s.flag ? ' (flagged)' : ''}</option>)}
              </select>
              <span className="muted"> vs selected {cur?.date}</span>
            </label>
          )}
          {compare && pol === 'RGB' && view !== 'swipe' && <p className="hint">This view uses HH.</p>}
          {view === 'swipe' && (
            <label className="row">Split <input type="range" min={0} max={1} step={0.01} value={swipe} onChange={(e) => setSwipe(+e.target.value)} /></label>
          )}
          {view === 'change' && (
            <label className="row">Hide changes under {threshold} dB
              <input type="range" min={0} max={8} step={0.5} value={threshold} onChange={(e) => setThreshold(+e.target.value)} />
            </label>
          )}
        </section>

        <section className="legend">
          {view === 'change' ? (
            <>
              <div className="ramp" style={{ background: cssGradient(DIVERGING) }} />
              <div className="ticks"><span>-6 dB darker</span><span>0</span><span>+6 dB brighter</span></div>
            </>
          ) : view === 'temporal' ? (
            <p><span className="sw" style={{ background: '#f33' }} /> got darker <span className="sw" style={{ background: '#3ff' }} /> got brighter <span className="sw" style={{ background: '#888' }} /> unchanged</p>
          ) : pol === 'RGB' ? (
            <p><span className="sw" style={{ background: '#f4a' }} /> urban <span className="sw" style={{ background: '#3c6' }} /> vegetation <span className="sw" style={{ background: '#000', outline: '1px solid #555' }} /> smooth water</p>
          ) : (
            <>
              <div className="ramp" style={{ background: 'linear-gradient(to right, #000, #fff)' }} />
              <div className="ticks"><span>{stretch[p1][0]} dB</span><span>{stretch[p1][1]} dB</span></div>
            </>
          )}
          <p className="hint">{VIEW_HINT[view]}</p>
        </section>

        <section>
          <label className="row"><input type="checkbox" checked={cvOn} onChange={(e) => setCvOn(e.target.checked)} /> Show most changed areas</label>
          {cvOn && (
            <>
              <div className="ramp" style={{ background: cssGradient(SEQUENTIAL) }} />
              <div className="ticks"><span>{cvThr}</span><span>2.0</span></div>
              <label className="row">Threshold <input type="range" min={0.2} max={1.5} step={0.05} value={cvThr} onChange={(e) => setCvThr(+e.target.value)} /></label>
              <p className="hint">How much each spot varied across all unflagged dates ({p1}, coefficient of variation of power). Use it to find where to click.</p>
            </>
          )}
        </section>

        <section>
          <h2>Inspect</h2>
          {!box && <p className="hint">Click the map to chart a spot over time. Shift-drag to chart a rectangle.</p>}
          {box && series && (
            <>
              <p className="muted">Area about {boxSizeM} m wide, mean of {(box[2] - box[0] + 1) * (box[3] - box[1] + 1)} pixels, averaged in power.</p>
              <Chart dates={sc.map((s) => s.date)} flagged={flagged} current={idx}
                series={(['HH', 'HV'] as P[]).map((p) => ({ name: p, color: COLORS[p], values: series[p] }))} />
              <p className="key"><span style={{ color: COLORS.HH }}>HH</span> <span style={{ color: COLORS.HV }}>HV</span> <span className="muted">hollow = flagged date</span></p>
              <table className="nums">
                <thead><tr><th>Date</th><th>HH</th><th>HV</th></tr></thead>
                <tbody>{sc.map((s, i) => (
                  <tr key={s.date} className={i === idx ? 'on' : ''}>
                    <td>{s.date}{s.flag ? ' *' : ''}</td><td>{series.HH[i]?.toFixed(1)}</td><td>{series.HV[i]?.toFixed(1)}</td>
                  </tr>
                ))}</tbody>
              </table>
              <button className="link" onClick={() => setBox(undefined)}>Clear selection</button>
            </>
          )}
        </section>

        <section>
          <button className="link" onClick={() => setDrawer(!drawer)} aria-expanded={drawer}>Data source and provenance</button>
          {drawer && cur && (
            <div className="drawer">
              {(['HH', 'HV'] as P[]).map((p) => cur[p] && (
                <dl key={p}>
                  <dt>{p}</dt>
                  <dd><a href={asfLink(cur[p]!.granule!)} target="_blank" rel="noreferrer">{cur[p]!.granule}</a></dd>
                  <dd>Tier {cur[p]!.tier}, track {cur[p]!.track} {cur[p]!.direction === 'A' ? 'ascending' : 'descending'}, frame {cur[p]!.frame}, {cur[p]!.bandwidthMHz} MHz, incidence {cur[p]!.incidenceDeg} deg, {cur[p]!.validPct}% of the area valid</dd>
                </dl>
              ))}
              <p className="hint">NISAR L2 GCOV from ASF DAAC: terrain-corrected γ0 backscatter, resampled to about 30 m by averaging in power.
                PROVISIONAL means calibrated and partially validated, VALIDATED means fully calibrated and validated.
                Every date here comes from the same track, direction and frame, so the viewing geometry never changes.</p>
            </div>
          )}
        </section>
      </aside>

      <footer className="time">
        <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        {sc.length > 0 && <Timeline dates={sc.map((s) => s.date)} flagged={flagged} idx={idx} before={compare ? before : undefined} onPick={(i) => { setIdx(i); setPlaying(false) }} />}
      </footer>
    </div>
  )
}
