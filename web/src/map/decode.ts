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

const BASE = `${import.meta.env.BASE_URL}data/`

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

export const loadManifest = (site: string) => json<Manifest>(`${BASE}${site}/manifest.json`)

const rasters = new Map<string, Promise<Uint8Array>>()

/** Decode a single-channel PNG to its raw 8-bit values. Cached per file. */
export function loadRaster(site: string, file: string): Promise<Uint8Array> {
  const key = `${site}/${file}`
  let p = rasters.get(key)
  if (!p) {
    p = (async () => {
      const r = await fetch(BASE + key)
      if (!r.ok) throw new Error(`${r.status} ${key}`)
      // No color management or premultiplication, so the gray values come back exactly as baked.
      const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(bmp, 0, 0)
      const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data
      const v = new Uint8Array(bmp.width * bmp.height)
      for (let i = 0; i < v.length; i++) v[i] = rgba[i * 4]
      return v
    })()
    p.catch(() => rasters.delete(key)) // let a failed fetch retry next time
    rasters.set(key, p)
  }
  return p
}
