import { useEffect, useState } from 'react'
import Explore from './modes/Explore'
import Rewind from './modes/Rewind'

// Hash routing keeps GitHub Pages happy (no server rewrites). Landing page and Lab join in M4.
const mode = () => (location.hash === '#rewind' ? 'rewind' : 'explore')

export default function App() {
  const [m, setM] = useState(mode)
  useEffect(() => {
    const on = () => setM(mode())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return m === 'rewind' ? <Rewind /> : <Explore />
}
