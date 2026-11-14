import { describe, expect, it } from 'vitest'
import taxJson from '../../../taxonomy/taxonomy.json'
import catalog from '../../../seed/catalog.json'
import { emptyInput, validateInput, type DocInput } from '../../src/lib/model.ts'
import { MULTI_DIMS, withKeys, type Taxonomy } from '../../src/lib/taxonomy.ts'

const tax = withKeys(taxJson as unknown as Taxonomy)
type Entry = (typeof catalog.entries)[number]

function toInput(e: Entry): DocInput {
  const input = { ...emptyInput(), title: e.title, folder: e.folder, docType: e.docType, status: e.status, publisher: e.publisher,
    meetingDate: e.meetingDate, year: e.year, summary: e.summary, restricted: e.restricted, versionLabel: e.versionLabel } as DocInput
  for (const dim of MULTI_DIMS) input[dim] = (e as unknown as Record<string, string[]>)[dim] ?? []
  return input
}

describe('seed catalog', () => {
  it('every entry is valid against the taxonomy', () => {
    for (const e of catalog.entries) expect(validateInput(toInput(e), tax), e.file).toEqual([])
  })
  it('file keys are unique and links point at catalog entries', () => {
    const files = new Set(catalog.entries.map((e) => e.file))
    expect(files.size).toBe(catalog.entries.length)
    for (const e of catalog.entries) for (const l of e.links) expect(files.has(l.targetFile), `${e.file} -> ${l.targetFile}`).toBe(true)
  })
  it('every version family has exactly one current version', () => {
    const fams = new Map<string, Entry[]>()
    for (const e of catalog.entries) if (e.family) fams.set(e.family, [...(fams.get(e.family) ?? []), e])
    for (const [f, list] of fams) {
      expect(list.length, f).toBeGreaterThan(1)
      expect(list.filter((e) => e.current).length, f).toBe(1)
    }
  })
  it('external sources are not filed as internal stages', () => {
    for (const e of catalog.entries) if (e.publisher !== 'program') expect(['02-1', '02-2', '02-3', '02-4', '03'], e.file).toContain(e.folder)
  })
})
