// The baked sites, shared by the globe, Explore and Rewind. Centers match pipeline/sites.yaml.

/** A guided first look: which view to open in Explore, or a pointer to Rewind when the change takes decades. */
export type Story = { text: string; pol?: 'HH' | 'HV' | 'RGB'; view?: 'single' | 'change'; before?: string; after?: string; rewind?: boolean }

export const SITES: { id: string; name: string; place: string; center: [number, number]; blurb: string; colors: string; story: Story }[] = [
  {
    id: 'abu-dhabi',
    name: 'Abu Dhabi coast',
    place: 'United Arab Emirates',
    center: [54.45, 24.45] as [number, number],
    blurb: 'A coastline people keep reshaping: new islands, new districts and mangroves planted along the shore.',
    colors: 'The strongest echoes come out yellow and pink, mostly buildings. Green leans toward plants, and the darkest patches are smooth sand and calm water.',
    story: { pol: 'RGB', text: 'Switch polarization to Color. The yellow and pink grids are buildings, so you can read the street plan of the city from radar alone. Rewind shows those districts growing out of the desert and the sea.' },
  },
  {
    id: 'kosi',
    name: 'Kosi River floodplain',
    place: 'Bihar, India',
    center: [86.55, 26.1] as [number, number],
    blurb: 'A braided river that shifts its channels every monsoon, with farmland pressed up against its embankments.',
    colors: 'The dark blue ribbons are the river channels and calm water. Yellow-green is where both polarizations come back strong, mostly crops and trees. Pink and purple lean toward bare or harvested fields and sand bars, where the echo is mostly HH.',
    story: { pol: 'HH', view: 'change', before: '2026-06-20', after: '2026-08-19', text: 'Compare June with the August monsoon. The red patches west of the river went dark as fields filled with standing water, while much of the farmland to the east got brighter as the crops grew.' },
  },
  {
    id: 'rondonia',
    name: 'Rondônia forest edge',
    place: 'Amazon, Brazil',
    center: [-63.0, -9.5] as [number, number],
    blurb: 'A frontier where rainforest has been cleared for pasture since the 1970s, one road and one plot at a time.',
    colors: 'Standing forest comes out yellow-green: the long waves bounce around inside the canopy and come back strong in both polarizations. Cleared pasture is purple and grey, where the echo is weaker and mostly HH. The dark winding ribbon is the river.',
    story: { pol: 'HV', view: 'change', before: '2026-06-25', after: '2026-10-23', text: 'Compare the dry season with the first rains in HV, the polarization that sees vegetation. The standing forest barely changes, while the pasture changes field by field, each plot a sharp rectangle.' },
  },
  {
    id: 'lake-mead',
    name: 'Lake Mead',
    place: 'Nevada and Arizona, USA',
    center: [-114.65, 36.15] as [number, number],
    blurb: 'The biggest reservoir in the United States, drawn down by a drought that has run since 2000, leaving new shoreline and bathtub rings on the canyon walls.',
    colors: 'The lake is the smooth dark shape in the middle: calm water bounces the pulse away, so almost nothing comes back. Bare desert mountains come out purple, and slopes that face the satellite flash yellow. The bright grid in the bottom left corner is Boulder City.',
    story: { rewind: true, text: 'The big change here plays out over decades. Rewind opens on the oldest photo next to today: drag the split, then scrub to 2000 and 2010 to watch the lake pull back from its shores.' },
  },
  {
    id: 'kilauea',
    name: 'Kīlauea volcano',
    place: 'Hawaiʻi, USA',
    center: [-155.05, 19.4] as [number, number],
    blurb: 'One of the most active volcanoes on Earth. Its lava has rebuilt this coast again and again, burying roads, towns and a whole bay in 2018.',
    colors: 'Rainforest and farms come out yellow-green. The purple ground is lava: bare young rock with no plants to scatter the waves around, so the echo is mostly HH. The wide purple apron south of the middle is the flow field of Puʻu ʻŌʻō, which erupted from 1983 to 2018. The grey-green sheet is the ocean, roughened by the wind.',
    story: { pol: 'RGB', text: 'Switch polarization to Color to tell lava from forest. Then open Rewind, pick Then vs now and scrub back to 2015: the 2018 flow appears on the east tip of the island.' },
  },
]

/** A site's center, for starting a map in the right place before its bounds load. */
export const centerOf = (id: string) => SITES.find((s) => s.id === id)?.center ?? SITES[0].center

export const siteOr = (id?: string) => (SITES.some((s) => s.id === id) ? id! : SITES[0].id)

/** Keep the URL shareable when the site changes, without a page reload or a hashchange. */
export const rememberSite = (mode: string, id: string) => history.replaceState(null, '', `#${mode}/${id}`)
