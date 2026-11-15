import { describe, expect, it } from 'vitest'
import { coefVariation, logRatio, rectPixels, regionSeries, toDb } from './change'
import { renderDiverging, renderPolRGB } from './render'
import { DIVERGING } from './colormaps'
import { lngLatToPixel, pixelToLngLat, type Manifest } from './decode'
import { latestAt, monthOf, nearest } from './timeline'

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

describe('geo', () => {
  // Real Abu Dhabi grid from the baked manifest.
  const m = {
    bounds3857: [6042122.32, 2789115.28, 6080570.22, 2827563.18], shape: [1200, 1200],
  } as unknown as Manifest

  it('maps grid corners and round-trips pixels', () => {
    const [lng, lat] = pixelToLngLat(m, 0, 0)
    expect(lng).toBeCloseTo(54.277308, 5)
    expect(lat).toBeCloseTo(24.607107, 5)
    const [l2, a2] = pixelToLngLat(m, 600.5, 300.5)
    expect(lngLatToPixel(m, l2, a2)).toEqual([600, 300])
    expect(lngLatToPixel(m, 0, 0)).toBeNull()
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

describe('rewind time axis', () => {
  const L = (sensor: 'NISAR' | 'S1' | 'Landsat', date: string) => ({ sensor, date, file: date })
  it('puts years, months and days on one month scale', () => {
    expect(monthOf('1990')).toBe(1990 * 12)
    expect(monthOf('2019-10')).toBe(monthOf('2019-10-28'))
    expect(monthOf('2019-11') - monthOf('2019-10')).toBe(1)
  })
  it('picks the newest layer at or before t, never a future one', () => {
    const ls = [L('Landsat', '1990'), L('Landsat', '1995'), L('Landsat', '2000')]
    expect(latestAt(ls, monthOf('1994-06'))?.date).toBe('1990')
    expect(latestAt(ls, monthOf('1989-12'))).toBeUndefined()
    expect(latestAt([L('NISAR', '2026-10-05'), L('NISAR', '2026-10-28')], monthOf('2026-10'))?.date).toBe('2026-10-28')
  })
  it('finds the nearest date by month', () => {
    expect(nearest([L('NISAR', '2026-06-18'), L('NISAR', '2026-10-28')], '2026-09')?.date).toBe('2026-10-28')
  })
})
