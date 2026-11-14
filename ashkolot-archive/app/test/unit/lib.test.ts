import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import taxJson from '../../../taxonomy/taxonomy.json'
import { computeKeys, validateTaxonomyChange, withKeys, type Taxonomy } from '../../src/lib/taxonomy.ts'
import { diffInputs, emptyInput, normalizeInput, safeFileName, contentTypeFor, validateInput, type ArchiveDoc, type DocInput } from '../../src/lib/model.ts'
import { bestMatches, extractCardJson, normalizeTitle, parseCard, titleScore } from '../../src/lib/card.ts'
import { backlinks, emptyFilters, filterDocs, folderCounts, toCsv } from '../../src/lib/search.ts'
import { buildSkillZip, catalogMarkdown, taxonomyMarkdown } from '../../src/lib/skillgen.ts'

const tax = withKeys(taxJson as unknown as Taxonomy)

function validInput(over: Partial<DocInput> = {}): DocInput {
  return { ...emptyInput(), title: 'ניתוח SWOT – שירותים חברתיים – 2026', folder: '04', docType: 'analysis', status: 'draft', publisher: 'program', forum: ['social'], ...over }
}

function mkDoc(over: Partial<ArchiveDoc> = {}): ArchiveDoc {
  return {
    ...validInput(), id: 'd1', familyId: 'd1', isCurrent: true, archived: false, linkTargets: [], file: null, originalName: '',
    createdBy: 'a@x.org', createdAt: new Date('2026-01-01'), updatedBy: 'a@x.org', updatedAt: new Date('2026-01-02'), rev: 1, ...over,
  }
}

describe('taxonomy', () => {
  it('has unique, valid keys everywhere', () => {
    const keys = computeKeys(tax)
    for (const [dim, list] of Object.entries(keys)) {
      expect(new Set(list).size, dim).toBe(list.length)
      for (const k of list) expect(k, `${dim}:${k}`).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/)
    }
  })
  it('keys cover every dimension the security rules check', () => {
    const keys = computeKeys(tax)
    for (const k of ['folder', 'linkType', 'forum', 'dimension', 'responsibility', 'unit', 'leg', 'topic', 'stakeholderCircle', 'chapter', 'docType', 'status', 'publisher'])
      expect(keys[k], k).toBeDefined()
  })
  it('rejects deleting values, accepts deactivating and adding', () => {
    const removed = structuredClone(tax)
    removed.dimensions.topic.values = removed.dimensions.topic.values.slice(1)
    expect(validateTaxonomyChange(tax, removed).join()).toContain('אי אפשר למחוק')

    const ok = structuredClone(tax)
    ok.dimensions.topic.values[0].active = false
    ok.dimensions.topic.values.push({ key: 'housing', label: 'דיור' })
    expect(validateTaxonomyChange(tax, ok)).toEqual([])

    const badKey = structuredClone(tax)
    badKey.dimensions.topic.values.push({ key: 'דיור', label: 'דיור' })
    expect(validateTaxonomyChange(tax, badKey).length).toBeGreaterThan(0)
  })
})

describe('validateInput', () => {
  it('accepts a valid document', () => {
    expect(validateInput(validInput(), tax)).toEqual([])
  })
  it('rejects unknown values and missing required fields', () => {
    const errs = validateInput(validInput({ title: ' ', folder: '99', forum: ['nope'], docType: '' }), tax)
    expect(errs.join('|')).toMatch(/כותרת/)
    expect(errs.join('|')).toMatch(/תיקייה/)
    expect(errs.join('|')).toMatch(/nope/)
  })
  it('requires meeting date and forum in the meetings folder', () => {
    const errs = validateInput(validInput({ folder: '09', forum: [] }), tax)
    expect(errs.join('|')).toMatch(/תאריך מפגש/)
    expect(errs.join('|')).toMatch(/פורום/)
    expect(validateInput(validInput({ folder: '09', meetingDate: '2026-08-05', docType: 'summary' }), tax)).toEqual([])
  })
})

describe('normalize & diff', () => {
  it('dedupes and sorts multi values and links', () => {
    const n = normalizeInput(validInput({ topic: ['welfare', 'health', 'welfare'], links: [{ type: 'cites', to: 'x' }, { type: 'cites', to: 'x' }] }))
    expect(n.topic).toEqual(['health', 'welfare'])
    expect(n.links).toHaveLength(1)
  })
  it('reports only changed fields', () => {
    const a = validInput()
    const b = { ...a, folder: '05', topic: ['welfare'] }
    expect(Object.keys(diffInputs(a, b)).sort()).toEqual(['folder', 'topic'])
  })
})

describe('files', () => {
  it('sanitizes file names but keeps Hebrew', () => {
    expect(safeFileName('../../etc/passwd')).not.toContain('/')
    expect(safeFileName('ניתוח SWOT: גרסה "2".docx')).toBe('ניתוח SWOT_ גרסה _2_.docx')
    expect(safeFileName('.hidden')).toBe('hidden')
  })
  it('maps content types by extension and rejects unknown', () => {
    expect(contentTypeFor('a.PPTX')).toContain('presentationml')
    expect(contentTypeFor('virus.exe')).toBeNull()
    expect(contentTypeFor('page.html')).toBeNull()
  })
})

describe('filing card', () => {
  const card = '```json\n' + JSON.stringify({
    ashkolot_card: 1, originalName: 'ניתוח SWOTV1.docx', title: 'ניתוח SWOT – מודל האשכולות – 2026', folder: '04', docType: 'analysis',
    status: 'draft', publisher: 'program', forum: ['integration', 'bogus'], dimension: ['management'], responsibility: [], unit: [], leg: [],
    topic: [], stakeholderCircle: [], chapter: [], meetingDate: null, year: 2026, summary: 'סיכום', restricted: false,
    versionOf: 'ניתוח SWOT ראשוני', versionLabel: 'V1', links: [{ type: 'cites', target: 'דוח מבקר המדינה אשכולות 2026' }, { type: 'weird', target: 'משהו' }],
  }) + '\n```'

  it('parses a valid card and drops unknown values with warnings', () => {
    const p = parseCard('הנה הכרטיס:\n' + card + '\nבהצלחה', tax)
    expect(p.input.folder).toBe('04')
    expect(p.input.forum).toEqual(['integration'])
    expect(p.input.year).toBe(2026)
    expect(p.versionOf).toBe('ניתוח SWOT ראשוני')
    expect(p.pendingLinks).toEqual([{ type: 'cites', target: 'דוח מבקר המדינה אשכולות 2026' }, { type: 'related', target: 'משהו' }])
    expect(p.warnings.join('|')).toMatch(/bogus/)
    expect(validateInput(p.input, tax)).toEqual([])
  })
  it('rejects non-cards and garbage', () => {
    expect(() => parseCard('{"title":"x"}', tax)).toThrow(/ashkolot_card/)
    expect(() => extractCardJson('no json here')).toThrow()
    expect(() => extractCardJson('{ broken')).toThrow()
    expect(() => extractCardJson('x'.repeat(30000))).toThrow(/ארוך/)
  })
  it('never lets the card inject non-taxonomy folder values', () => {
    const p = parseCard(JSON.stringify({ ashkolot_card: 1, title: 't', folder: '<script>', docType: 'analysis', status: 'draft', publisher: 'program' }), tax)
    expect(p.input.folder).toBe('')
  })
})

describe('title matching', () => {
  it('normalizes punctuation, extensions and niqqud', () => {
    expect(normalizeTitle('ניתוח_SWOT_ראשוני_מתוקן.docx')).toBe('ניתוח swot ראשוני מתוקן')
  })
  it('scores similar titles high and unrelated low', () => {
    expect(titleScore('ניתוח SWOT ראשוני', 'ניתוח SWOT ראשוני.docx')).toBe(1)
    expect(titleScore('ניתוח SWOT ראשוני', 'מפת המתחים סביב אזוריות')).toBeLessThan(0.2)
  })
  it('finds best matches', () => {
    const docs = [{ id: '1', title: 'דוח מבקר המדינה – אשכולות אזוריים – 2026' }, { id: '2', title: 'מפת המתחים – שתי רגליים' }]
    expect(bestMatches('דוח מבקר המדינה אשכולות 2026', docs)[0].doc.id).toBe('1')
  })
})

describe('search', () => {
  const docs = [
    mkDoc({ id: 'a', title: 'SWOT חברתי', folder: '04', topic: ['welfare'] }),
    mkDoc({ id: 'b', title: 'OECD ביזור', folder: '02-2', publisher: 'oecd', status: 'reference', links: [{ type: 'cites', to: 'a' }] }),
    mkDoc({ id: 'c', title: 'SWOT ישן', folder: '04', isCurrent: false }),
    mkDoc({ id: 'd', title: 'בארכיון', folder: '05', archived: true }),
  ]
  it('hides old versions and archived by default', () => {
    expect(filterDocs(docs, emptyFilters(), tax).map((d) => d.id).sort()).toEqual(['a', 'b'])
  })
  it('parent folder includes sub folders', () => {
    expect(filterDocs(docs, { ...emptyFilters(), folder: '02' }, tax).map((d) => d.id)).toEqual(['b'])
    expect(folderCounts(docs)).toMatchObject({ '04': 1, '02-2': 1, '02': 1 })
  })
  it('searches tag labels and text', () => {
    expect(filterDocs(docs, { ...emptyFilters(), text: 'רווחה' }, tax).map((d) => d.id)).toEqual(['a'])
    expect(filterDocs(docs, { ...emptyFilters(), tags: { publisher: ['oecd'] } }, tax).map((d) => d.id)).toEqual(['b'])
  })
  it('computes backlinks', () => {
    expect(backlinks(docs, 'a').map((b) => b.doc.id)).toEqual(['b'])
  })
  it('csv escapes formulas', () => {
    const csv = toCsv([mkDoc({ title: '=HYPERLINK("evil")' })], tax)
    expect(csv).toContain(`"'=HYPERLINK(""evil"")"`)
  })
})

describe('skill generation', () => {
  const skillMd = readFileSync(new URL('../../../skill/ashkolot-filing/SKILL.md', import.meta.url), 'utf8')

  it('SKILL.md only references folder keys that exist', () => {
    const referenced = [...skillMd.matchAll(/`(0\d(?:-\d)?)`/g)].map((m) => m[1])
    const keys = new Set(tax.folders.map((f) => f.key))
    expect(referenced.length).toBeGreaterThan(5)
    for (const k of referenced) expect(keys.has(k), k).toBe(true)
  })
  it('SKILL.md card template contains every field the parser reads', () => {
    for (const f of ['ashkolot_card', 'title', 'folder', 'docType', 'status', 'publisher', 'forum', 'dimension', 'responsibility', 'unit', 'leg', 'topic', 'stakeholderCircle', 'chapter', 'meetingDate', 'year', 'summary', 'restricted', 'versionOf', 'versionLabel', 'links'])
      expect(skillMd, f).toContain(`"${f}"`)
  })
  it('the card template in SKILL.md parses with the app parser', () => {
    const block = skillMd.match(/```json\n([\s\S]*?)```/)![1]
    const p = parseCard(block, tax)
    expect(p.pendingLinks[0].type).toBe('derived-from')
  })
  it('taxonomy reference lists active values only', () => {
    const t = structuredClone(tax)
    t.dimensions.topic.values[0].active = false
    const md = taxonomyMarkdown(t)
    expect(md).not.toContain('`welfare`')
    expect(md).toContain('`health`')
  })
  it('builds a zip with the expected structure', () => {
    const zip = unzipSync(buildSkillZip(skillMd, tax, [{ title: 'מסמך א', folder: '04', docType: 'analysis', year: 2026, versionLabel: '', forum: ['social'] }]))
    expect(Object.keys(zip).sort()).toEqual(['ashkolot-filing/SKILL.md', 'ashkolot-filing/references/catalog.md', 'ashkolot-filing/references/taxonomy.md'])
    expect(strFromU8(zip['ashkolot-filing/references/catalog.md'])).toContain('מסמך א')
  })
  it('catalog markdown handles an empty archive', () => {
    expect(catalogMarkdown(tax, [], new Date('2026-11-14'))).toContain('הארכיון עדיין ריק')
  })
})
