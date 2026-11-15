// The baked sites, shared by the globe, Explore and Rewind. Centers match pipeline/sites.yaml.
export const SITES = [
  {
    id: 'abu-dhabi',
    name: 'Abu Dhabi coast',
    place: 'United Arab Emirates',
    center: [54.45, 24.45] as [number, number],
    blurb: 'A coastline people keep reshaping: new islands, new districts and mangroves planted along the shore.',
    colors: 'The strongest echoes come out yellow and pink, mostly buildings. Green leans toward plants, and the darkest patches are smooth sand and calm water.',
  },
  {
    id: 'kosi',
    name: 'Kosi River floodplain',
    place: 'Bihar, India',
    center: [86.55, 26.1] as [number, number],
    blurb: 'A braided river that shifts its channels every monsoon, with farmland pressed up against its embankments.',
    colors: 'The dark blue ribbons are the river channels and calm water. Yellow-green is where both polarizations come back strong, mostly crops and trees. Pink and purple lean toward bare or harvested fields and sand bars, where the echo is mostly HH.',
  },
]

/** A site's center, for starting a map in the right place before its bounds load. */
export const centerOf = (id: string) => SITES.find((s) => s.id === id)?.center ?? SITES[0].center

export const siteOr = (id?: string) => (SITES.some((s) => s.id === id) ? id! : SITES[0].id)

/** Keep the URL shareable when the site changes, without a page reload or a hashchange. */
export const rememberSite = (mode: string, id: string) => history.replaceState(null, '', `#${mode}/${id}`)
