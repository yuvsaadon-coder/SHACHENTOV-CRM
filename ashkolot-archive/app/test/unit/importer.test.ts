import { describe, expect, it } from 'vitest'
import catalog from '../../../seed/catalog.json'
import taxJson from '../../../taxonomy/taxonomy.json'
import { entryToInput, planImport, stableDocId, type CatalogEntry } from '../../src/lib/importer.ts'
import { validateInput } from '../../src/lib/model.ts'
import { withKeys, type Taxonomy } from '../../src/lib/taxonomy.ts'
import { createHash } from 'node:crypto'

const entries = catalog.entries as unknown as CatalogEntry[]
const tax = withKeys(taxJson as unknown as Taxonomy)
const f = (name: string, size: number) => ({ name, size })

describe('in-app import', () => {
  it('matches by name, disambiguates by size, skips duplicates and reports unknown files', () => {
    const files = [
      f('folder/ניתוח SWOT ראשוני.docx', 61282),
      f('אזוריות בארץ ובעולם.pdf', 317106),
      f('skira1 (2).pdf', 317106), // עותק זהה בשם אחר
      f('אזוריות בארץ ובעולם.pdf', 317106), // עותק זהה באותו שם
      f('אשכול נגב מערבי - מצגת פתיחה סמינר הנהגה .pptx', 12582330),
      f('אשכול נגב מערבי - מצגת פתיחה סמינר הנהגה .pptx', 12247225),
      f('משהו חדש.docx', 10),
    ]
    const p = planImport(entries, files)
    expect(p.matched.map((m) => m.file.name).sort()).toEqual([
      'folder/ניתוח SWOT ראשוני.docx', 'אזוריות בארץ ובעולם.pdf',
      'אשכול נגב מערבי - מצגת פתיחה סמינר הנהגה .pptx', 'אשכול נגב מערבי - מצגת פתיחה סמינר הנהגה .pptx',
    ].sort())
    expect(new Set(p.matched.map((m) => m.entry.seq)).size).toBe(4)
    expect(p.unknown.map((x) => x.name)).toEqual(['משהו חדש.docx'])
    expect(p.notFound.length).toBe(entries.length - 4)
    // מיובא לפי סדר המזהים
    const seqs = p.matched.map((m) => m.entry.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })

  it('uses the same stable ids as the import script', async () => {
    const key = entries[0].file
    const expected = 'imp' + createHash('sha256').update(key.normalize('NFC')).digest('hex').slice(0, 17)
    expect(await stableDocId(key)).toBe(expected)
  })

  it('every catalog entry becomes a valid document, with review notes on top of the summary', () => {
    for (const e of entries) {
      const input = entryToInput(e, () => 'some-id')
      expect(validateInput(input, tax), e.file).toEqual([])
      if (e.needsReview) expect(input.summary.startsWith('⚠ לאימות:')).toBe(true)
    }
  })
})
