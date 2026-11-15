import { useEffect, useRef, type RefObject } from 'react'
import type { Map } from 'maplibre-gl'

/**
 * A line on the map at the split between two images, with a knob to drag it.
 * value runs 0..1 across the image from west to east, the same fraction the pages use to paste columns.
 */
export function useSplitHandle(mapRef: RefObject<Map | null>, corners: [number, number][] | undefined, on: boolean, value: number, set: (v: number) => void) {
  const v = useRef(value)
  const place = useRef<() => void>(() => {})

  useEffect(() => {
    const map = mapRef.current
    if (!map || !corners || !on) return
    const [w, n] = corners[0], e = corners[1][0], s = corners[2][1]
    const el = document.createElement('div')
    el.className = 'split-handle'
    el.innerHTML = '<span aria-hidden="true">⇆</span>'
    el.tabIndex = 0
    el.setAttribute('role', 'slider')
    el.setAttribute('aria-label', 'Split between the two images')
    el.setAttribute('aria-valuemin', '0')
    el.setAttribute('aria-valuemax', '100')
    map.getContainer().appendChild(el)

    place.current = () => {
      const lng = w + v.current * (e - w)
      const top = map.project([lng, n]), bottom = map.project([lng, s])
      el.style.transform = `translate(${top.x}px, ${top.y}px)`
      el.style.height = `${Math.max(0, bottom.y - top.y)}px`
      el.setAttribute('aria-valuenow', String(Math.round(v.current * 100)))
    }
    place.current()
    const onMove = place.current
    map.on('move', onMove)

    // Dragging repaints the whole picture, so send at most one update per frame.
    let frame = 0
    const send = (x: number) => {
      v.current = Math.min(1, Math.max(0, Math.round(x * 100) / 100))
      place.current()
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; set(v.current) })
    }
    const down = (ev: PointerEvent) => { el.setPointerCapture(ev.pointerId); ev.preventDefault(); ev.stopPropagation() }
    const move = (ev: PointerEvent) => {
      if (!el.hasPointerCapture(ev.pointerId)) return
      const r = map.getContainer().getBoundingClientRect()
      send((map.unproject([ev.clientX - r.left, ev.clientY - r.top]).lng - w) / (e - w))
    }
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
      ev.preventDefault()
      send(v.current + (ev.key === 'ArrowLeft' ? -0.02 : 0.02))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('keydown', key)
    return () => {
      cancelAnimationFrame(frame)
      map.off('move', onMove)
      el.remove()
      place.current = () => {}
    }
  }, [mapRef, corners, on, set])

  // The panel slider moves the line too.
  useEffect(() => { v.current = value; place.current() }, [value])
}
