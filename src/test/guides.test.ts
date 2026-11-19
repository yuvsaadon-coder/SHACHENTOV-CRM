import { describe, expect, it } from 'vitest'
import appSource from '../App.tsx?raw'
import { ALL_GUIDES, type GuideSection } from '../content/guides'

/** Every route App.tsx declares: absolute paths as written, portal children under /portal, the rest under /. */
function appRoutes(): Set<string> {
  const src = appSource
  const portalStart = src.indexOf('path="/portal"')
  const hqStart = src.indexOf('{/* HQ')
  expect(portalStart).toBeGreaterThan(-1)
  expect(hqStart).toBeGreaterThan(portalStart)

  const routes = new Set<string>()
  const add = (chunk: string, prefix: string) => {
    for (const m of chunk.matchAll(/path="([^"]+)"/g)) {
      const p = m[1]
      routes.add(p.startsWith('/') ? p : `${prefix}${p}`)
    }
  }
  add(src.slice(0, portalStart), '/')
  add(src.slice(portalStart, hqStart), '/portal/')
  add(src.slice(hqStart), '/')
  return routes
}

const sections: { guide: string; s: GuideSection }[] = ALL_GUIDES.flatMap((g) => g.sections.map((s) => ({ guide: g.id, s })))

describe('guides', () => {
  it('has the three guides', () => {
    expect(ALL_GUIDES.map((g) => g.id)).toEqual(['hq', 'admin', 'coordinator'])
  })

  it('every section has a title, a summary and at least one step or paragraph', () => {
    for (const { guide, s } of sections) {
      const label = `${guide}/${s.id}`
      expect(s.title.trim(), label).not.toBe('')
      expect(s.summary.trim(), label).not.toBe('')
      expect((s.steps?.length ?? 0) + (s.paragraphs?.length ?? 0), label).toBeGreaterThan(0)
    }
  })

  it('section ids are unique across all guides', () => {
    const ids = sections.map(({ s }) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every in-app link points to a route that exists in App.tsx', () => {
    const routes = appRoutes()
    for (const { guide, s } of sections) {
      if (!s.link) continue
      expect(routes.has(s.link.to), `${guide}/${s.id} -> ${s.link.to}`).toBe(true)
    }
  })

  it('admin sections are all marked managers-only', () => {
    const admin = ALL_GUIDES.find((g) => g.id === 'admin')!
    expect(admin.sections.every((s) => s.managersOnly)).toBe(true)
  })
})
