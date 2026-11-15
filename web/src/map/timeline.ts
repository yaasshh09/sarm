// Rewind time axis: months since year 0, so Landsat years, S1 months and NISAR days share one scale.
import type { Layer } from './decode'

/** "1990" -> Jan 1990, "2019-10" and "2019-10-28" -> Oct 2019. */
export function monthOf(date: string): number {
  const [y, m = '1'] = date.split('-')
  return +y * 12 + (+m - 1)
}

/** The newest layer dated at or before month t, or undefined. */
export function latestAt(layers: Layer[], t: number): Layer | undefined {
  let best: Layer | undefined
  for (const l of layers) if (monthOf(l.date) <= t && (!best || l.date > best.date)) best = l
  return best
}

/** Days since 1970. A bare year counts as 1 July and a bare month as the 15th, the middle of what they stand for. */
export function dayOf(date: string): number {
  const [y, m, d] = date.split('-')
  return Date.UTC(+y, m ? +m - 1 : 6, d ? +d : m ? 15 : 1) / 864e5
}

/** The layer dated nearest to `date`, to the day. */
export function nearest(layers: Layer[], date: string): Layer | undefined {
  const t = dayOf(date)
  return [...layers].sort((a, b) => Math.abs(dayOf(a.date) - t) - Math.abs(dayOf(b.date) - t))[0]
}

export const monthLabel = (t: number) =>
  new Date(Date.UTC(Math.floor(t / 12), t % 12, 1)).toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })
