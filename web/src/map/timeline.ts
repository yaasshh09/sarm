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

/** The layer whose month is nearest to `date`. */
export function nearest(layers: Layer[], date: string): Layer | undefined {
  const t = monthOf(date)
  return [...layers].sort((a, b) => Math.abs(monthOf(a.date) - t) - Math.abs(monthOf(b.date) - t))[0]
}

export const monthLabel = (t: number) =>
  new Date(Date.UTC(Math.floor(t / 12), t % 12, 1)).toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })
