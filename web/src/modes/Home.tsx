import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ImageSource, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { loadManifest, loadRaster, type Layer, type Manifest } from '../map/decode'
import { renderPolRGB } from '../map/render'
import { monthLabel, monthOf } from '../map/timeline'
import { SITES } from '../sites'

maplibregl.setWorkerUrl(workerUrl)

// NASA Blue Marble from GIBS: public domain, open CORS, tiles down to zoom 8.
const EARTH: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0] },
  sources: {
    earth: {
      type: 'raster', tileSize: 256, maxzoom: 8,
      tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'],
      attribution: 'Globe: NASA Blue Marble via GIBS',
    },
  },
  layers: [{ id: 'earth', type: 'raster', source: 'earth' }],
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
const HOME = { center: [40, 18] as [number, number], zoom: innerWidth < 700 ? 0.6 : 1.5 }

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
      el.className = 'pin'
      el.innerHTML = `<i></i><span>${s.name}</span>`
      el.setAttribute('aria-label', `${s.name}, ${s.place}`)
      el.addEventListener('click', (e) => { e.stopPropagation(); setSel(s.id) })
      new maplibregl.Marker({ element: el }).setLngLat(s.center).addTo(map)
    }

    map.on('load', async () => {
      spin()
      for (const s of SITES) {
        try {
          const i = infoOf(await loadManifest(s.id))
          setInfo((o) => ({ ...o, [s.id]: i }))
          const hv = i.shown && i.m.layers.find((l) => l.sensor === 'NISAR' && l.pol === 'HV' && l.date === i.shown!.date)
          if (!i.shown || !hv) continue
          // Drape the newest clean NISAR pass on the globe as an HH/HV color picture.
          const [rows, cols] = i.m.shape
          const img = new ImageData(cols, rows)
          renderPolRGB(await loadRaster(s.id, i.shown.file), await loadRaster(s.id, hv.file), img.data)
          map.addSource(s.id, { type: 'image', coordinates: i.m.cornersLngLat } as maplibregl.ImageSourceSpecification)
          map.addLayer({ id: s.id, type: 'raster', source: s.id, paint: { 'raster-fade-duration': 0 } })
          ;(map.getSource(s.id) as ImageSource).updateImage({ image: img })
        } catch (e) {
          setError(`I could not load ${s.name}: ${(e as Error).message}`)
        }
      }
    })
    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    for (const s of SITES) if (map?.getLayer(s.id)) map.setLayoutProperty(s.id, 'visibility', radar ? 'visible' : 'none')
  }, [radar, info])

  // Fly to the picked site, keeping it clear of the text panel.
  useEffect(() => {
    const map = mapRef.current
    const s = SITES.find((x) => x.id === sel)
    if (!map || !s) return
    spinning.current = false
    const p = panel.current!.getBoundingClientRect()
    const pad = p.width < innerWidth * 0.6
      ? { left: p.right + 30, right: 60, top: 60, bottom: 60 }
      : { left: 30, right: 30, top: 60, bottom: innerHeight - p.top + 30 }
    const c = info[s.id]?.m.cornersLngLat
    const [w, so, e, n] = c ? [c[0][0], c[2][1], c[1][0], c[0][1]] : [s.center[0] - 0.2, s.center[1] - 0.2, s.center[0] + 0.2, s.center[1] + 0.2]
    map.fitBounds([[w, so], [e, n]], { padding: pad, duration: 4000, curve: 1.6, essential: true })
  }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    setSel(undefined)
    mapRef.current?.flyTo({ ...HOME, pitch: 0, bearing: 0, duration: 3000 })
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
            <h1>Radar <span>Waltz</span></h1>
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
              <li><b>Rewind.</b> Line NISAR up with ten years of Sentinel-1 radar and forty years of Landsat photos.</li>
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
                  <a className="btn ghost" href={`#rewind/${s.id}`}>Rewind 40 years</a>
                </div>
                {i.shown && (
                  <div className="card">
                    <label className="row"><input type="checkbox" checked={radar} onChange={(e) => setRadar(e.target.checked)} /> Show the NISAR picture on the globe</label>
                    <p className="muted">That square is NISAR L-band from {i.shown.date} ({i.shown.tier?.toLowerCase()} data), colored by polarization: red HH, green HV, blue HH minus HV.</p>
                    <p className="muted">Pink to white reads as buildings, green as plants, black as calm water. Untick the box to compare it with the Blue Marble photo underneath.</p>
                  </div>
                )}
              </>
            ) : <p className="muted">Loading the site…</p>}
          </>
        )}
        {error && <p className="error">{error}</p>}
        <footer className="credits">
          Radar data: NISAR (NASA and ISRO) via ASF DAAC, Sentinel-1 (ESA Copernicus) and Landsat (USGS and NASA) via Microsoft Planetary Computer. Globe: NASA Blue Marble via GIBS. Built by me for NASA Space Apps 2026.
        </footer>
      </main>
    </div>
  )
}
