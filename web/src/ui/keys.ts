import { useEffect } from 'react'

/** Left and right arrows step through time, except in form fields and on the map, which pans with them. */
export function useArrowSteps(step: (dir: -1 | 1) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if ((e.target as HTMLElement).closest('input, select, textarea, [role=slider], .maplibregl-canvas')) return
      e.preventDefault()
      step(e.key === 'ArrowLeft' ? -1 : 1)
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }) // re-bound each render so it always steps from the current state
}
