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
  it('has the HQ and coordinator guides only', () => {
    expect(ALL_GUIDES.map((g) => g.id)).toEqual(['hq', 'coordinator'])
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
      for (const l of [...(s.link ? [s.link] : []), ...(s.links ?? [])]) {
        expect(routes.has(l.to), `${guide}/${s.id} -> ${l.to}`).toBe(true)
      }
    }
  })

  it('has no system-manager or login/dashboard instructions in the HQ guide', () => {
    const hq = ALL_GUIDES.find((g) => g.id === 'hq')!
    const ids = hq.sections.map((s) => s.id)
    expect(ids).not.toContain('hq-start')
    expect(ids).not.toContain('hq-overview')
    expect(ids).toContain('hq-organization')
    for (const gone of ['hq-roles', 'hq-contacts', 'hq-branches']) expect(ids).not.toContain(gone)
    const text = hq.sections.map((s) => [s.title, s.summary, ...(s.paragraphs ?? []), ...(s.steps ?? []), ...(s.tips ?? [])].join(' ')).join(' ')
    expect(text).not.toContain('מנהל מערכת')
    expect(text).not.toContain('מנהלי מערכת')
  })
})
