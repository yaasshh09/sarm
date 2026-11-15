// Dark vector basemap shared by Explore and Rewind.
import type { Map } from 'maplibre-gl'

export const BASEMAP = 'https://tiles.openfreemap.org/styles/dark'

/** The dark style draws gray labels with a blurred halo, which smears over bright radar. Make them light with a sharp outline. */
export function crispLabels(map: Map) {
  for (const l of map.getStyle().layers) {
    if (l.type !== 'symbol' || !map.getLayoutProperty(l.id, 'text-field')) continue
    map.setPaintProperty(l.id, 'text-color', '#e6e6e6')
    map.setPaintProperty(l.id, 'text-halo-color', '#000')
    map.setPaintProperty(l.id, 'text-halo-width', 1)
    map.setPaintProperty(l.id, 'text-halo-blur', 0)
  }
}

/** Layer id to insert data under so roads and borders stay beneath it and only labels sit on top. */
export function labelsAbove(map: Map): string | undefined {
  const ls = map.getStyle().layers
  const last = ls.findLastIndex((l) => l.type !== 'symbol')
  return ls.slice(last + 1).find((l) => l.type === 'symbol')?.id
}
