// Guards the baked data against a broken deploy: every site the app lists must have a manifest whose files exist.
import { describe, expect, it } from 'vitest'
import type { Manifest } from './map/decode'
import { SITES } from './sites'

const manifests = import.meta.glob('../public/data/*/manifest.json', { eager: true, import: 'default' }) as Record<string, Manifest>
const files = new Set(Object.keys(import.meta.glob('../public/data/**/*.{png,jpg}')))

describe('baked data', () => {
  for (const s of SITES) {
    it(`${s.id} has a manifest whose files all exist`, () => {
      const m = manifests[`../public/data/${s.id}/manifest.json`]
      expect(m, 'manifest').toBeDefined()
      const missing = m.layers.map((l) => l.file).filter((f) => !files.has(`../public/data/${s.id}/${f}`))
      expect(missing).toEqual([])
    })

    it(`${s.id} has NISAR HH and HV for every date`, () => {
      const nisar = manifests[`../public/data/${s.id}/manifest.json`].layers.filter((l) => l.sensor === 'NISAR')
      const dates = (pol: string) => nisar.filter((l) => l.pol === pol).map((l) => l.date).sort()
      expect(dates('HH').length).toBeGreaterThan(0)
      expect(dates('HV')).toEqual(dates('HH'))
    })

    it(`${s.id} pin sits inside its data box`, () => {
      // the Kosi box once drifted off its pin; this catches sites.ts and sites.yaml disagreeing
      const c = manifests[`../public/data/${s.id}/manifest.json`].cornersLngLat
      const [lng, lat] = s.center
      expect(lng).toBeGreaterThan(c[0][0]); expect(lng).toBeLessThan(c[1][0])
      expect(lat).toBeGreaterThan(c[2][1]); expect(lat).toBeLessThan(c[0][1])
    })
  }
})
