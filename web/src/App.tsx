import { Component, useEffect, useState, type ReactNode } from 'react'
import Explore from './modes/Explore'
import Home from './modes/Home'
import Rewind from './modes/Rewind'

// Hash routing keeps GitHub Pages happy (no server rewrites): #explore/kosi[/story], #rewind/abu-dhabi[/then], anything else is the globe.
const route = () => location.hash.slice(1)

/** If a page crashes, say so plainly instead of leaving a blank screen. Keyed by route, so moving on resets it. */
class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="crash">
        <h1>Something broke on this page</h1>
        <p>I could not draw it: {this.state.error.message}</p>
        <p><a href="#">Back to the globe</a> or <button className="link" onClick={() => location.reload()}>reload</button>.</p>
      </main>
    )
  }
}

export default function App() {
  const [r, setR] = useState(route)
  useEffect(() => {
    const on = () => setR(route())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const [mode, site, view] = r.split('/')
  const page = mode === 'explore' ? <Explore key={r} initialSite={site} initialView={view} /> : mode === 'rewind' ? <Rewind key={r} initialSite={site} initialView={view} /> : <Home />
  return <Boundary key={r}>{page}</Boundary>
}
