// Fill RGBA pixel buffers (ImageData.data) from quantized radar rasters. Pure, no DOM.
import { DIVERGING, SEQUENTIAL } from './colormaps'
import { toDb } from './change'

export type Stretch = [number, number] // dB low, dB high

const scale = (db: number, [lo, hi]: Stretch) => Math.max(0, Math.min(255, ((db - lo) / (hi - lo)) * 255))

function put(out: Uint8ClampedArray, i: number, r: number, g: number, b: number, a = 255) {
  const j = i * 4
  out[j] = r
  out[j + 1] = g
  out[j + 2] = b
  out[j + 3] = a
}

/** Single polarization in grayscale. Nodata is transparent. */
export function renderGray(v: Uint8Array, out: Uint8ClampedArray, s: Stretch) {
  for (let i = 0; i < v.length; i++) {
    if (v[i] === 0) { put(out, i, 0, 0, 0, 0); continue }
    const g = scale(toDb(v[i]), s)
    put(out, i, g, g, g)
  }
}

/** R = HH, G = HV, B = HH minus HV. Double bounce reads magenta-red, vegetation volume green. */
export function renderPolRGB(hh: Uint8Array, hv: Uint8Array, out: Uint8ClampedArray,
  sHH: Stretch = [-25, 0], sHV: Stretch = [-32, -8], sDiff: Stretch = [0, 15]) {
  for (let i = 0; i < hh.length; i++) {
    if (hh[i] === 0 || hv[i] === 0) { put(out, i, 0, 0, 0, 0); continue }
    const a = toDb(hh[i]), b = toDb(hv[i])
    put(out, i, scale(a, sHH), scale(b, sHV), scale(a - b, sDiff))
  }
}

/** R = before, G = B = after. Red = lost brightness, cyan = gained, gray = unchanged. */
export function renderTemporalRGB(before: Uint8Array, after: Uint8Array, out: Uint8ClampedArray, s: Stretch) {
  for (let i = 0; i < before.length; i++) {
    if (before[i] === 0 || after[i] === 0) { put(out, i, 0, 0, 0, 0); continue }
    const r = scale(toDb(before[i]), s), c = scale(toDb(after[i]), s)
    put(out, i, r, c, c)
  }
}

/** Diverging map of a dB difference. |d| under threshold is transparent so the base map shows through. */
export function renderDiverging(d: Float32Array, out: Uint8ClampedArray, threshold: number, maxAbs = 6) {
  for (let i = 0; i < d.length; i++) {
    const x = d[i]
    if (!(Math.abs(x) >= threshold)) { put(out, i, 0, 0, 0, 0); continue } // also catches NaN
    const k = Math.round(((Math.max(-maxAbs, Math.min(maxAbs, x)) + maxAbs) / (2 * maxAbs)) * 255) * 3
    put(out, i, DIVERGING[k], DIVERGING[k + 1], DIVERGING[k + 2])
  }
}

/** Sequential map (e.g. coefficient of variation). Values under threshold are transparent. */
export function renderSequential(x: Float32Array, out: Uint8ClampedArray, threshold: number, max: number) {
  for (let i = 0; i < x.length; i++) {
    if (!(x[i] >= threshold)) { put(out, i, 0, 0, 0, 0); continue }
    const k = Math.round(Math.min(1, (x[i] - threshold) / (max - threshold)) * 255) * 3
    put(out, i, SEQUENTIAL[k], SEQUENTIAL[k + 1], SEQUENTIAL[k + 2])
  }
}
