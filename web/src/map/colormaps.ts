// 256-entry RGB lookup tables built from a few stops.

type Stop = [number, number, number]

function lut(stops: Stop[]): Uint8Array {
  const out = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1)
    const k = Math.min(Math.floor(t), stops.length - 2)
    const f = t - k
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(stops[k][c] * (1 - f) + stops[k + 1][c] * f)
  }
  return out
}

// ColorBrewer RdBu (colorblind-safe), oriented so loss of brightness is red and gain is blue.
export const DIVERGING = lut([
  [103, 0, 31], [178, 24, 43], [214, 96, 77], [244, 165, 130], [253, 219, 199], [247, 247, 247],
  [209, 229, 240], [146, 197, 222], [67, 147, 195], [33, 102, 172], [5, 48, 97],
])

// Viridis stops (perceptually uniform, colorblind-safe).
export const SEQUENTIAL = lut([
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
  [31, 158, 137], [53, 183, 121], [110, 206, 88], [181, 222, 43], [253, 231, 37],
])

export function cssGradient(table: Uint8Array, steps = 8): string {
  const parts = Array.from({ length: steps + 1 }, (_, i) => {
    const j = Math.round((i / steps) * 255) * 3
    return `rgb(${table[j]},${table[j + 1]},${table[j + 2]})`
  })
  return `linear-gradient(to right, ${parts.join(', ')})`
}
