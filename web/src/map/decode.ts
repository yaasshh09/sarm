// Load baked site data from public/data (PLAN.md 4 contract). Browser only.

export type Layer = {
  sensor: 'NISAR' | 'S1' | 'Landsat'
  band?: string
  date: string
  pol?: string
  tier?: 'VALIDATED' | 'PROVISIONAL' | 'BETA'
  track?: number
  frame?: number
  direction?: string
  bandwidthMHz?: string
  file: string
  granule?: string
  incidenceDeg?: number
  validPct?: number
  flag?: string
  // Sentinel-1 and Landsat (Rewind)
  orbit?: number
  nDates?: number
  product?: string
  scenes?: string[]
  platforms?: string[]
  note?: string
  raw?: boolean
  cloudCoverPct?: number
}

export type Manifest = {
  id: string
  name: string
  bounds3857: [number, number, number, number]
  cornersLngLat: [[number, number], [number, number], [number, number], [number, number]]
  shape: [number, number]
  db: { min: number; max: number }
  layers: Layer[]
}

const R = 6378137

/** [row, col] of the site grid pixel under a lng/lat, or null if outside. */
export function lngLatToPixel(m: Manifest, lng: number, lat: number): [number, number] | null {
  const [x0, y0, x1, y1] = m.bounds3857
  const [rows, cols] = m.shape
  const x = (R * lng * Math.PI) / 180
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const r = Math.floor(((y1 - y) / (y1 - y0)) * rows)
  const c = Math.floor(((x - x0) / (x1 - x0)) * cols)
  return r >= 0 && r < rows && c >= 0 && c < cols ? [r, c] : null
}

/** lng/lat of a pixel corner (row, col may be fractional). */
export function pixelToLngLat(m: Manifest, r: number, c: number): [number, number] {
  const [x0, y0, x1, y1] = m.bounds3857
  const [rows, cols] = m.shape
  const x = x0 + (c / cols) * (x1 - x0)
  const y = y1 - (r / rows) * (y1 - y0)
  return [(x / R) * (180 / Math.PI), (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)]
}

const BASE = `${import.meta.env.BASE_URL}data/`

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

export const loadManifest = (site: string) => json<Manifest>(`${BASE}${site}/manifest.json`)

const cache = new Map<string, Promise<Uint8Array | Uint8ClampedArray>>()

async function decode(key: string) {
  const r = await fetch(BASE + key)
  if (!r.ok) throw new Error(`${r.status} ${key}`)
  // No color management or premultiplication, so the values come back exactly as baked.
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data
}

function cached<T extends Uint8Array | Uint8ClampedArray>(key: string, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) {
    p = make()
    p.catch(() => cache.delete(key)) // let a failed fetch retry next time
    cache.set(key, p)
  }
  return p
}

/** Decode a single-channel PNG to its raw 8-bit values. Cached per file. */
export const loadRaster = (site: string, file: string) =>
  cached(`${site}/${file}`, async () => {
    const rgba = await decode(`${site}/${file}`)
    const v = new Uint8Array(rgba.length / 4)
    for (let i = 0; i < v.length; i++) v[i] = rgba[i * 4]
    return v
  })

/** Decode an RGB image (Landsat JPEG) to opaque RGBA. Cached per file. */
export const loadRGBA = (site: string, file: string) => cached(`${site}/${file}`, () => decode(`${site}/${file}`))
