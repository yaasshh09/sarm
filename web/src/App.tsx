import { useEffect, useState } from 'react'
import Explore from './modes/Explore'
import Home from './modes/Home'
import Rewind from './modes/Rewind'

// Hash routing keeps GitHub Pages happy (no server rewrites): #explore/kosi, #rewind/abu-dhabi, anything else is the globe.
const route = () => location.hash.slice(1)

export default function App() {
  const [r, setR] = useState(route)
  useEffect(() => {
    const on = () => setR(route())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const [mode, site] = r.split('/')
  if (mode === 'explore') return <Explore key={r} initialSite={site} />
  if (mode === 'rewind') return <Rewind key={r} initialSite={site} />
  return <Home />
}
