import { describe, expect, it } from 'vitest'
import { coefVariation, logRatio, rectPixels, regionSeries, toDb } from './change'
import { renderDiverging, renderPolRGB } from './render'
import { DIVERGING } from './colormaps'

// Inverse of the PLAN.md 4 quantizer, for building fixtures.
const q = (db: number) => 1 + Math.round(((db + 35) / 40) * 254)

describe('change math', () => {
  it('decodes the quantizer contract', () => {
    expect(toDb(1)).toBeCloseTo(-35)
    expect(toDb(255)).toBeCloseTo(5)
    expect(toDb(0)).toBeNaN()
    expect(toDb(q(-12.3))).toBeCloseTo(-12.3, 1)
  })

  it('log ratio is after minus before in dB, NaN on nodata', () => {
    const d = logRatio(Uint8Array.of(q(-10), q(-20), 0), Uint8Array.of(q(-16), q(-14), q(-5)))
    expect(d[0]).toBeCloseTo(-6, 1)
    expect(d[1]).toBeCloseTo(6, 1)
    expect(d[2]).toBeNaN()
  })

  it('region mean averages in power, not dB', () => {
    const [m] = regionSeries([Uint8Array.of(q(-10), q(-20), 0)], [0, 1, 2])
    expect(m).toBeCloseTo(10 * Math.log10((0.1 + 0.01) / 2), 1) // -12.6 dB, not -15
  })

  it('coefficient of variation is 0 for a constant pixel and NaN with under 2 samples', () => {
    const a = Uint8Array.of(q(-10), q(-10), 0)
    const b = Uint8Array.of(q(-10), q(0), 0)
    const cv = coefVariation([a, a, b])
    expect(cv[0]).toBeCloseTo(0, 5)
    expect(cv[1]).toBeGreaterThan(0.5)
    expect(cv[2]).toBeNaN()
  })

  it('rect pixels are inclusive and order independent', () => {
    expect(rectPixels(10, 1, 1, 0, 0)).toEqual([0, 1, 10, 11])
  })
})

describe('render', () => {
  it('diverging hides sub-threshold and NaN, colors loss red and gain blue', () => {
    const out = new Uint8ClampedArray(4 * 4)
    renderDiverging(Float32Array.of(0.5, NaN, -6, 6), out, 1, 6)
    expect(out[3]).toBe(0)
    expect(out[7]).toBe(0)
    expect([out[8], out[9], out[10], out[11]]).toEqual([DIVERGING[0], DIVERGING[1], DIVERGING[2], 255])
    expect(out[8]).toBeGreaterThan(out[10]) // red end
    expect(out[14]).toBeGreaterThan(out[12]) // blue end
  })

  it('pol RGB puts HH in red and HV in green', () => {
    const out = new Uint8ClampedArray(4)
    renderPolRGB(Uint8Array.of(q(0)), Uint8Array.of(q(-32)), out)
    expect(out[0]).toBe(255)
    expect(out[1]).toBe(0)
    expect(out[3]).toBe(255)
  })
})
