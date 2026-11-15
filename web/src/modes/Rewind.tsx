import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ImageSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { loadManifest, loadRaster, loadRGBA, type Layer, type Manifest } from '../map/decode'
import { latestAt, monthLabel, monthOf, nearest } from '../map/timeline'
import { renderGray, type Stretch } from '../map/render'
import { toDb } from '../map/change'

import { SITES, centerOf, rememberSite, siteOr } from '../sites'
import { BASEMAP, crispLabels, foldCredits, labelsAbove } from '../map/basemap'
import { useArrowSteps } from '../ui/keys'
import { useSplitHandle } from '../ui/split'

maplibregl.setWorkerUrl(workerUrl)

const T0 = monthOf('1985-01')
const T1 = monthOf('2026-11')
const CO_POL: Stretch = [-25, 0] // same stretch for S1 VV and NISAR HH so the two radars compare fairly
const LANES = [
  { sensor: 'Landsat', label: 'Landsat', band: ' optical' },
  { sensor: 'S1', label: 'Sentinel-1', band: ' C-band' },
  { sensor: 'NISAR', label: 'NISAR', band: ' L-band' },
] as const

type View = 'auto' | 'split' | 'then' | 'cvl'

const platform = (p: string) => p.replace('landsat-', 'Landsat ')

/** Plain-language label for a layer, so another sensor is never mistaken for NISAR. */
function describe(l: Layer): string {
  if (l.sensor === 'NISAR') return `NISAR L-band radar (24 cm waves), ${l.pol}, ${l.date}, ${l.tier}`
  if (l.sensor === 'S1') return `Sentinel-1 C-band radar (5.6 cm waves), ${l.pol}, ${monthLabel(monthOf(l.date))}, median of ${l.nDates} pass${l.nDates === 1 ? '' : 'es'}`
  if (l.raw) return `Landsat photo, one raw scene from ${l.date} (${l.platforms?.map(platform).join(', ')}), clouds and all`
  return `Landsat photo, ${l.date} composite (${l.platforms?.map(platform).join(', ')})`
}

/** Median dB of the valid pixels of a quantized raster, via its 256-bin histogram. */
function medianDb(v: Uint8Array): number {
  const h = new Uint32Array(256)
  for (const x of v) h[x]++
  const n = v.length - h[0]
  let acc = 0
  for (let i = 1; i < 256; i++) if ((acc += h[i]) >= n / 2) return toDb(i)
  return NaN
}

const VIEWS: View[] = ['auto', 'split', 'then', 'cvl']

export default function Rewind({ initialSite, initialView }: { initialSite?: string; initialView?: string }) {
  const [site, setSite] = useState(() => siteOr(initialSite))
  const [m, setM] = useState<Manifest>()
  const [error, setError] = useState<string>()
  const [t, setT] = useState(T0)
  const [view, setView] = useState<View>(() => VIEWS.find((v) => v === initialView) ?? 'auto')
  const [swipe, setSwipe] = useState(0.5)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [cvl, setCvl] = useState<{ s1: number; nisar: number }>()
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map>(null)

  // One co-polarized radar layer per date, so the lanes and the scrub stay simple.
  const lanes = useMemo(() => {
    const ls = m?.layers ?? []
    return {
      Landsat: ls.filter((l) => l.sensor === 'Landsat' && !l.raw),
      raw: ls.filter((l) => l.sensor === 'Landsat' && l.raw),
      S1: ls.filter((l) => l.sensor === 'S1' && l.pol === 'VV'),
      NISAR: ls.filter((l) => l.sensor === 'NISAR' && l.pol === 'HH'),
    }
  }, [m])
  const radarAt = (tt: number) => latestAt(lanes.NISAR, tt) ?? latestAt(lanes.S1, tt)
  const opticalAt = (tt: number) => latestAt([...lanes.Landsat, ...lanes.raw], tt)
  const stops = useMemo(() => [...new Set([...lanes.Landsat, ...lanes.raw, ...lanes.S1, ...lanes.NISAR].map((l) => monthOf(l.date)))].sort((a, b) => a - b), [lanes])

  // "Same month, two radars": the newest S1 month against the NISAR date closest to it.
  const s1Last = lanes.S1.at(-1)
  const nisarNear = s1Last && nearest(lanes.NISAR, s1Last.date)

  let left: Layer | undefined, right: Layer | undefined
  if (view === 'cvl') { left = s1Last; right = nisarNear }
  else if (view === 'then') { left = opticalAt(t); right = lanes.Landsat.at(-1) }
  else if (view === 'split') {
    left = opticalAt(t)
    // A radar pass in the same month as the photo beats "newest in the month": pair the closest day, NISAR first like everywhere else.
    const near = (ls: Layer[]) => {
      const same = left ? ls.filter((l) => monthOf(l.date) === monthOf(left!.date) && monthOf(l.date) <= t) : []
      return same.length ? nearest(same, left!.date) : undefined
    }
    right = near(lanes.NISAR) ?? near(lanes.S1) ?? radarAt(t)
  }
  else right = radarAt(t) ?? opticalAt(t)

  useEffect(() => {
    const map = new maplibregl.Map({ container: mapDiv.current!, style: BASEMAP, center: centerOf(site), zoom: 9, attributionControl: { compact: true } })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.on('load', () => { crispLabels(map); foldCredits(map); setReady(true) })
    mapRef.current = map
    return () => map.remove()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- built once; the site only sets where it starts

  useEffect(() => {
    setM(undefined); setError(undefined); setPlaying(false); setCvl(undefined)
    loadManifest(site).then((mm) => {
      setM(mm)
      // Open on the oldest picture rather than an empty January 1985, so pressing play tells the story from the start.
      setT(Math.min(...mm.layers.map((l) => monthOf(l.date))))
    }).catch((e) => setError(`We couldn't load ${site}: ${e.message}`))
  }, [site])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !m) return
    const src = map.getSource('rw') as ImageSource | undefined
    if (src) src.setCoordinates(m.cornersLngLat)
    else {
      map.addSource('rw', { type: 'image', coordinates: m.cornersLngLat } as maplibregl.ImageSourceSpecification)
      map.addLayer({ id: 'rw', type: 'raster', source: 'rw', paint: { 'raster-fade-duration': 0 } },
        labelsAbove(map))
    }
    const [tl, , br] = m.cornersLngLat
    map.fitBounds([tl, br], { padding: 30, duration: 0 })
  }, [m, ready])

  // Draw the right layer full frame, then paste the left layer's columns over it for split views.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !m) return
    let stale = false
    const [rows, cols] = m.shape
    const draw = async (l: Layer, out: Uint8ClampedArray) =>
      l.sensor === 'Landsat' ? out.set(await loadRGBA(m.id, l.file)) : renderGray(await loadRaster(m.id, l.file), out, CO_POL)
    ;(async () => {
      const img = new ImageData(cols, rows)
      if (right) await draw(right, img.data)
      if (left && view !== 'auto') {
        const l = new ImageData(cols, rows)
        await draw(left, l.data)
        const split = Math.round(swipe * cols) * 4
        for (let r = 0; r < rows; r++) img.data.set(l.data.subarray(r * cols * 4, r * cols * 4 + split), r * cols * 4)
      }
      if (!stale) (map.getSource('rw') as ImageSource | undefined)?.updateImage({ image: img })
    })().catch((e) => setError(e.message))
    return () => { stale = true }
  }, [m, ready, left?.file, right?.file, view, swipe]) // eslint-disable-line react-hooks/exhaustive-deps

  // The area medians for the two-radar card, only once someone opens that view.
  useEffect(() => {
    if (view !== 'cvl' || !m || !s1Last || !nisarNear || cvl) return
    Promise.all([loadRaster(m.id, s1Last.file), loadRaster(m.id, nisarNear.file)])
      .then(([a, b]) => setCvl({ s1: medianDb(a), nisar: medianDb(b) })).catch((e) => setError(e.message))
  }, [view, m, s1Last, nisarNear, cvl])

  useSplitHandle(mapRef, m?.cornersLngLat, ready && view !== 'auto' && !!left, swipe, setSwipe)
  useArrowSteps((d) => {
    setPlaying(false)
    setT((cur) => (d > 0 ? stops.find((x) => x > cur) : stops.findLast((x) => x < cur)) ?? cur)
  })

  // Play steps through every month that has data, oldest to newest.
  useEffect(() => {
    if (!playing || !stops.length) return
    const id = setInterval(() => setT((cur) => stops.find((s) => s > cur) ?? stops[0]), 700)
    return () => clearInterval(id)
  }, [playing, stops])

  // While playing, fetch what the next stop will show, so the first run through does not stutter.
  useEffect(() => {
    if (!playing || !m) return
    const nx = stops.find((s) => s > t) ?? stops[0]
    const want = view === 'auto' ? [radarAt(nx) ?? opticalAt(nx)] : [radarAt(nx), opticalAt(nx)]
    for (const l of want) if (l) (l.sensor === 'Landsat' ? loadRGBA(m.id, l.file) : loadRaster(m.id, l.file)).catch(() => {}) // a miss just loads on demand
  }, [playing, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (tt: number) => `${((tt - T0) / (T1 - T0)) * 100}%`
  const notes = [view !== 'auto' ? left : undefined, right].map((l) => l?.note).filter((n): n is string => !!n)

  return (
    <div className="explore">
      <header className="bar">
        <h1>Sarm <span>Rewind</span></h1>
        <nav><a href="#">Globe</a> · <a href={`#explore/${site}`}>Explore</a> · <a href={`#rewind/${site}`} aria-current="page">Rewind</a></nav>
        <label>Site{' '}
          <select value={site} onChange={(e) => { setSite(e.target.value); rememberSite('rewind', e.target.value) }}>
            {SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <span className="sensor">1985 to 2026, three satellites on one timeline</span>
      </header>

      <div ref={mapDiv} className="map" />

      <aside className="panel">
        {error && <p className="error" role="alert">{error}</p>}
        <section>
          <h2>Showing</h2>
          {view !== 'auto' && left && <p className="layer-label"><span className="side">Left</span> {describe(left)}</p>}
          {right ? <p className="layer-label">{view !== 'auto' && <span className="side">Right</span>} {describe(right)}</p>
            : <p className="muted">Nothing here yet for {monthLabel(t)}. Drag the timeline forward.</p>}
          {notes.map((n) => <p key={n} className="hint">{n}</p>)}
        </section>

        <section>
          <h2>View</h2>
          <div className="seg">
            {VIEWS.map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                {{ auto: 'Best available', split: 'Photo vs radar', then: 'Then vs now', cvl: 'C-band vs L-band' }[v]}
              </button>
            ))}
          </div>
          <p className="hint">{{
            auto: 'Drag the timeline or tap the arrow keys. You get the newest picture at or before that moment, radar first if there is one.',
            split: 'Photo on the left, radar on the right, each the newest at or before the selected time. Drag the white line on the map to compare.',
            then: 'The photo from the selected time on the left, the newest one on the right. Go back in time, then drag the white line to see what changed.',
            cvl: 'The newest Sentinel-1 month next to the closest NISAR date: one place, seen at two radar wavelengths.',
          }[view]}</p>
          {view !== 'auto' && (
            <label className="row">Split <input type="range" min={0} max={1} step={0.01} value={swipe} onChange={(e) => setSwipe(+e.target.value)} /></label>
          )}
        </section>

        {view === 'cvl' && s1Last && nisarNear && (
          <section className="card">
            <h2>Same season, two radars</h2>
            <p>Sentinel-1 {monthLabel(monthOf(s1Last.date))} (C-band, VV) on the left, NISAR {nisarNear.date} (L-band, HH) on the right.</p>
            {cvl && <p className="muted">Median brightness over the area: Sentinel-1 {cvl.s1.toFixed(1)} dB, NISAR {cvl.nisar.toFixed(1)} dB.</p>}
            <p className="hint">L-band waves (24 cm) are about four times longer than C-band (5.6 cm). They slip through leaves and dry sand
              and bounce off trunks, soil and buried structures, while C-band mostly sees the top layer. The two satellites also differ in
              polarization (VV vs HH), viewing angle and orbit, so don't pin every difference on wavelength.</p>
          </section>
        )}

        {lanes.raw.length > 0 && (
          <section>
            <button className="link" onClick={() => { setView('split'); setT(monthOf(lanes.raw[0].date)) }}>Why radar? Put a cloudy monsoon photo next to radar</button>
          </section>
        )}

        <section className="legend">
          {view !== 'then' && <>
            <div className="ramp" style={{ background: 'linear-gradient(to right, #000, #fff)' }} />
            <div className="ticks"><span>{CO_POL[0]} dB</span><span>radar brightness</span><span>{CO_POL[1]} dB</span></div>
          </>}
          <p className="hint">Both radars share one contrast setting, and each site's photos share one too, so you can compare years fairly.</p>
        </section>

        <section>
          <h2>Sources</h2>
          <p className="hint">Landsat Collection 2 Level-2 and Sentinel-1 RTC from Microsoft Planetary Computer. NISAR L2 GCOV from the ASF DAAC.
            Each radar series sticks to one orbit and direction. Sentinel-1 and Landsat are separate missions. We show them for the longer history, and we never pass them off as NISAR.</p>
        </section>
      </aside>

      <footer className="time rewind-time">
        <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶︎'}</button>
        <div className="lanes">
          {LANES.map(({ sensor, label, band }) => (
            <div className="lane" key={sensor}>
              <span className="lane-name">{label}<span className="band">{band}</span></span>
              <div className="lane-track">
                {(sensor === 'Landsat' ? [...lanes.Landsat, ...lanes.raw] : lanes[sensor]).map((l) => (
                  <button key={l.file} className={`mark ${sensor}${l === left || l === right ? ' on' : ''}`} style={{ left: pct(monthOf(l.date)) }}
                    title={describe(l)} aria-label={describe(l)} onClick={() => { setT(monthOf(l.date)); setPlaying(false) }} />
                ))}
              </div>
            </div>
          ))}
          <div className="lane">
            <span className="lane-name">{monthLabel(t)}</span>
            <input className="scrub" type="range" min={T0} max={T1} value={t} onChange={(e) => { setT(+e.target.value); setPlaying(false) }} aria-label="Time" />
          </div>
          <div className="lane years"><span className="lane-name" />
            <div className="lane-track">{[1985, 1995, 2005, 2015, 2026].map((y) => <span key={y} style={{ left: pct(y * 12) }}>{y}</span>)}</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
