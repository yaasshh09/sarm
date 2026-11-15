import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ImageSource, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { loadManifest, loadRaster, type Layer, type Manifest } from '../map/decode'
import { renderPolRGB } from '../map/render'
import { monthLabel, monthOf } from '../map/timeline'
import { SITES } from '../sites'
import { foldCredits } from '../map/basemap'

maplibregl.setWorkerUrl(workerUrl)

// Raster tiles ignore screen density, so on sharp screens I ask for half-size tiles to get the next zoom level's detail.
const TILE = devicePixelRatio > 1 ? 128 : 256

// NASA Blue Marble (500 m) for the whole Earth, then 10 m Sentinel-2 cloudless fades in as you fly down to a site.
const EARTH: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0] },
  sources: {
    earth: {
      type: 'raster', tileSize: 128, maxzoom: 8,
      tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'],
      attribution: 'Globe: NASA Blue Marble via GIBS',
    },
    s2: {
      type: 'raster', tileSize: TILE, minzoom: 4, maxzoom: 16,
      tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg'],
      attribution: '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX (modified Copernicus Sentinel data 2024)',
    },
  },
  layers: [
    { id: 'earth', type: 'raster', source: 'earth' },
    { id: 's2', type: 'raster', source: 's2', minzoom: 4, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4.5, 0, 6.5, 1] } },
  ],
}

type Info = { m: Manifest; nisar: string[]; s1: string[]; landsat: string[]; shown?: Layer }

function infoOf(m: Manifest): Info {
  const dates = (s: Layer['sensor']) => [...new Set(m.layers.filter((l) => l.sensor === s && !l.raw).map((l) => l.date))].sort()
  const hh = m.layers.filter((l) => l.sensor === 'NISAR' && l.pol === 'HH' && !l.flag)
  return { m, nisar: dates('NISAR'), s1: dates('S1'), landsat: dates('Landsat'), shown: hh.sort((a, b) => a.date.localeCompare(b.date)).at(-1) }
}

const span = (d: string[], f = (x: string) => x) => (d.length ? `${f(d[0])} to ${f(d.at(-1)!)}` : 'none')
const month = (d: string) => monthLabel(monthOf(d))
const years = (d: string[]) => new Set(d.map((x) => x.slice(0, 4))).size
const THIS_YEAR = new Date().getFullYear()
const HOME = { center: [40, 18] as [number, number], zoom: innerWidth < 700 ? 0.6 : 1.9 }

/** Map padding that keeps the subject out from under the text panel (beside it on desktop, above it on phones). */
function clear(panel: HTMLElement, m: number) {
  const p = panel.getBoundingClientRect()
  return p.width < innerWidth * 0.6
    ? { left: p.right + m, right: m, top: m, bottom: m }
    : { left: m, right: m, top: m, bottom: innerHeight - p.top + m }
}

export default function Home() {
  const mapDiv = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const mapRef = useRef<maplibregl.Map>(null)
  const spinning = useRef(!matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [info, setInfo] = useState<Record<string, Info>>({})
  const [sel, setSel] = useState<string>()
  const [radar, setRadar] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const map = new maplibregl.Map({ container: mapDiv.current!, style: EARTH, ...HOME, attributionControl: { compact: true } })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    mapRef.current = map
    map.setPadding(clear(panel.current!, 0))

    // Spin slowly until the first touch, like a desk globe.
    const spin = () => {
      if (!spinning.current || map.getZoom() > 3) return
      const c = map.getCenter()
      map.easeTo({ center: [c.lng + 3, c.lat], duration: 1000, easing: (t) => t })
    }
    const stop = () => { spinning.current = false }
    map.on('moveend', spin)
    map.on('mousedown', stop); map.on('touchstart', stop); map.on('wheel', stop)

    for (const s of SITES) {
      const el = document.createElement('button')
      // Labels go right of the pin, unless another site sits just east at a similar latitude, where the label would run into it.
      const crowded = SITES.some((x) => x !== s && x.center[0] > s.center[0] && x.center[0] - s.center[0] < 45 && Math.abs(x.center[1] - s.center[1]) < 12)
      el.className = crowded ? 'pin west' : 'pin'
      el.innerHTML = `<i></i><span>${s.name}</span>`
      el.setAttribute('aria-label', `${s.name}, ${s.place}`)
      el.addEventListener('click', (e) => { e.stopPropagation(); setSel(s.id) })
      new maplibregl.Marker({ element: el }).setLngLat(s.center).addTo(map)
    }

    map.on('load', () => {
      spin(); foldCredits(map)
      // Only the small manifests up front; each radar picture loads when its site is picked.
      for (const s of SITES) {
        loadManifest(s.id).then((m) => setInfo((o) => ({ ...o, [s.id]: infoOf(m) })))
          .catch((e) => setError(`I could not load ${s.name}: ${e.message}`))
      }
    })
    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    for (const s of SITES) if (map?.getLayer(s.id)) map.setLayoutProperty(s.id, 'visibility', radar ? 'visible' : 'none')
  }, [radar, info])

  // Drape the picked site's newest clean NISAR pass on the globe as an HH/HV color picture, once.
  const i0 = sel ? info[sel] : undefined
  useEffect(() => {
    const map = mapRef.current
    if (!map || !sel || !i0?.shown || map.getSource(sel)) return
    const hv = i0.m.layers.find((l) => l.sensor === 'NISAR' && l.pol === 'HV' && l.date === i0.shown!.date)
    if (!hv) return
    map.addSource(sel, { type: 'image', coordinates: i0.m.cornersLngLat } as maplibregl.ImageSourceSpecification)
    map.addLayer({ id: sel, type: 'raster', source: sel, layout: { visibility: radar ? 'visible' : 'none' }, paint: { 'raster-fade-duration': 0 } })
    const [rows, cols] = i0.m.shape
    Promise.all([loadRaster(sel, i0.shown.file), loadRaster(sel, hv.file)]).then(([a, b]) => {
      const img = new ImageData(cols, rows)
      renderPolRGB(a, b, img.data)
      ;(map.getSource(sel) as ImageSource | undefined)?.updateImage({ image: img })
    }).catch((e) => setError(`I could not load the radar picture: ${e.message}`))
  }, [sel, i0]) // eslint-disable-line react-hooks/exhaustive-deps -- radar only sets the starting visibility

  // Fly to the picked site. The map's own padding keeps it clear of the panel; fitBounds padding adds to that.
  useEffect(() => {
    const map = mapRef.current
    const s = SITES.find((x) => x.id === sel)
    if (!map || !s) return
    spinning.current = false
    map.setPadding(clear(panel.current!, 0)) // the panel changes height between views on phones
    const c = info[s.id]?.m.cornersLngLat
    const [w, so, e, n] = c ? [c[0][0], c[2][1], c[1][0], c[0][1]] : [s.center[0] - 0.2, s.center[1] - 0.2, s.center[0] + 0.2, s.center[1] + 0.2]
    map.fitBounds([[w, so], [e, n]], { padding: 60, duration: 4000, curve: 1.6, essential: true })
  }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    setSel(undefined)
    mapRef.current?.flyTo({ ...HOME, padding: clear(panel.current!, 0), pitch: 0, bearing: 0, duration: 3000 })
  }

  const s = SITES.find((x) => x.id === sel)
  const i = sel ? info[sel] : undefined

  return (
    <div className="home">
      <div ref={mapDiv} className="globe" />
      <main ref={panel} className="intro">
        {!s ? (
          <>
            <p className="kicker">NASA Space Apps 2026 · Dancing With SARs</p>
            <h1>Sarm</h1>
            <p className="lede">I wanted to see what NISAR, the new NASA and ISRO radar satellite, sees when it looks at a planet that keeps changing. Spin the globe and pick a place.</p>
            <div className="picks">
              {SITES.map((x) => (
                <button key={x.id} onClick={() => setSel(x.id)}>
                  <b>{x.name}</b><small>{x.place}</small>
                </button>
              ))}
            </div>

            <h2>How radar sees</h2>
            <ul className="how">
              <li><b>It brings its own light.</b> NISAR sends microwave pulses down and listens for the echoes, so it works at night and straight through clouds and smoke.</li>
              <li><b>Bright means rough.</b> Buildings, rocks and trees standing in water throw a lot of energy back.</li>
              <li><b>Dark means smooth.</b> Calm water bounces the pulse away like a mirror, so it shows up almost black.</li>
              <li><b>Long waves dig deeper.</b> NISAR's L-band waves are 24 cm long and reach further into plants than the 5.6 cm waves of Sentinel-1.</li>
            </ul>

            <h2>Three ways in</h2>
            <ul className="how">
              <li><b>Globe.</b> You are here. Fly to a site and see the newest NISAR pass draped over the Earth.</li>
              <li><b>Explore.</b> Scrub through every NISAR pass over a site, compare two dates and map what changed.</li>
              <li><b>Rewind.</b> Line NISAR up with more than ten years of Sentinel-1 radar and forty years of Landsat photos.</li>
            </ul>
          </>
        ) : (
          <>
            <button className="link back" onClick={back}>← Back to the whole Earth</button>
            <p className="kicker">{s.place}</p>
            <h1 className="site-title">{s.name}</h1>
            <p className="lede">{s.blurb}</p>
            {i ? (
              <>
                <dl className="facts">
                  <dt>NISAR L-band</dt><dd>{i.nisar.length} passes, {span(i.nisar, month)}</dd>
                  <dt>Sentinel-1 C-band</dt><dd>{years(i.s1)} years, {span(i.s1, (d) => d.slice(0, 4))}</dd>
                  <dt>Landsat photos</dt><dd>{i.landsat.length} snapshots, {span(i.landsat)}</dd>
                </dl>
                <div className="go">
                  <a className="btn" href={`#explore/${s.id}`}>Explore the NISAR data</a>
                  <a className="btn ghost" href={`#rewind/${s.id}`}>{i.landsat.length ? `Rewind ${THIS_YEAR - +i.landsat[0].slice(0, 4)} years` : "Rewind"}</a>
                </div>
                {i.shown && (
                  <div className="card">
                    <label className="row"><input type="checkbox" checked={radar} onChange={(e) => setRadar(e.target.checked)} /> Show the NISAR picture on the globe</label>
                    <p className="muted">That square is NISAR L-band from {i.shown.date} ({i.shown.tier?.toLowerCase()} data), colored by polarization: red HH, green HV, blue HH minus HV.</p>
                    <p className="muted">{s.colors} Untick the box to compare it with the Sentinel-2 photo underneath.</p>
                  </div>
                )}
              </>
            ) : <p className="muted">Loading the site…</p>}
          </>
        )}
        {error && <p className="error">{error}</p>}
        <footer className="credits">
          Radar data: NISAR (NASA and ISRO) via ASF DAAC, Sentinel-1 (ESA Copernicus) and Landsat (USGS and NASA) via Microsoft Planetary Computer. Globe: NASA Blue Marble via GIBS and Sentinel-2 cloudless by EOX. Built by me for NASA Space Apps 2026.
        </footer>
      </main>
    </div>
  )
}
