// Change math on quantized radar rasters (PLAN.md 4: 0 = nodata, 1..255 = -35..+5 dB).

export const DB_MIN = -35
export const DB_MAX = 5
const STEP = (DB_MAX - DB_MIN) / 254

export const toDb = (v: number) => (v === 0 ? NaN : (v - 1) * STEP + DB_MIN)
const toPow = (v: number) => 10 ** (toDb(v) / 10)

/** dB(after) - dB(before) per pixel. NaN where either is nodata. */
export function logRatio(before: Uint8Array, after: Uint8Array): Float32Array {
  const out = new Float32Array(before.length)
  for (let i = 0; i < out.length; i++) {
    out[i] = before[i] === 0 || after[i] === 0 ? NaN : (after[i] - before[i]) * STEP
  }
  return out
}

/** Coefficient of variation of linear power across the stack. High = changed a lot. */
export function coefVariation(stack: Uint8Array[]): Float32Array {
  const n = stack[0].length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0, s2 = 0, k = 0
    for (const layer of stack) {
      if (layer[i] === 0) continue
      const p = toPow(layer[i])
      s += p
      s2 += p * p
      k++
    }
    if (k < 2) { out[i] = NaN; continue }
    const mean = s / k
    out[i] = Math.sqrt(Math.max(0, s2 / k - mean * mean)) / mean
  }
  return out
}

/** Region mean per layer, averaged in power and returned in dB. NaN if the region has no data. */
export function regionSeries(stack: Uint8Array[], pixels: number[]): number[] {
  return stack.map((layer) => {
    let s = 0, k = 0
    for (const i of pixels) {
      if (layer[i] === 0) continue
      s += toPow(layer[i])
      k++
    }
    return k ? 10 * Math.log10(s / k) : NaN
  })
}

/** Pixel indices inside a rectangle given in pixel coordinates (inclusive). */
export function rectPixels(cols: number, r0: number, c0: number, r1: number, c1: number): number[] {
  const out: number[] = []
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) out.push(r * cols + c)
  return out
}
