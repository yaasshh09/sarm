// Dark vector basemap shared by Explore and Rewind.
import type { Map } from 'maplibre-gl'

export const BASEMAP = 'https://tiles.openfreemap.org/styles/dark'

/** Layer id to insert data under so roads and borders stay beneath it and only labels sit on top. */
export function labelsAbove(map: Map): string | undefined {
  const ls = map.getStyle().layers
  const last = ls.findLastIndex((l) => l.type !== 'symbol')
  return ls.slice(last + 1).find((l) => l.type === 'symbol')?.id
}
