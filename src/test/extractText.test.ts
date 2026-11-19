// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectKind, extractText } from '../../netlify/functions/_extractText'

const asset = (rel: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../public/${rel}`, import.meta.url))))

// A one-page PDF with no text at all, like a scan.
const BLANK_PDF = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF',
)

describe('extractText on the real files of the system', () => {
  it('reads a Word document in Hebrew', async () => {
    const r = await extractText(asset('templates/hafifa-hila.docx'), 'hafifa-hila.docx')
    expect(r.kind).toBe('docx')
    expect(r.text).toContain('בית שמש')
    expect(r.text.length).toBeGreaterThan(1000)
  })

  it('reads every sheet of an Excel file, rows joined with |', async () => {
    const r = await extractText(asset('templates/חלוקת-ירושלים.xlsx'), 'חלוקת-ירושלים.xlsx')
    expect(r.kind).toBe('xlsx')
    expect(r.text).toContain('גיליון: ')
    expect(r.text).toContain('רשימת רכזי סניפי ירושלים')
    expect(r.text).toContain(' | ')
  })

  it('reads a Hebrew PDF with a text layer', async () => {
    const r = await extractText(asset('templates/מסמך-חפיפה.pdf'), 'מסמך-חפיפה.pdf')
    expect(r.kind).toBe('pdf')
    expect(r.pages).toBe(1)
    expect(r.scanned).toBeFalsy()
    expect(r.text).toContain('סלי')
    expect(r.text).toContain('[עמוד 1]')
  })

  it('reads an English research article across its pages', async () => {
    const r = await extractText(asset('articles/article_00.pdf'), 'article_00.pdf')
    expect(r.pages).toBeGreaterThan(5)
    expect(r.text.length).toBeGreaterThan(10_000)
    expect(r.text).toContain('volunteer')
  })
}, 60_000)

describe('extractText edge cases', () => {
  it('flags a PDF without text as scanned', async () => {
    const r = await extractText(BLANK_PDF, 'scan.pdf')
    expect(r.scanned).toBe(true)
    expect(r.text).toBe('')
  })

  it('uses OCR for a scanned PDF only when it is given', async () => {
    const r = await extractText(BLANK_PDF, 'scan.pdf', { ocr: async () => 'טקסט מתומלל מהסריקה' })
    expect(r.scanned).toBeFalsy()
    expect(r.text).toBe('טקסט מתומלל מהסריקה')
  })

  it('reads plain text and reports unsupported types honestly', async () => {
    const t = await extractText(new TextEncoder().encode('שלום\n\n\n\nעולם'), 'note.txt')
    expect(t).toMatchObject({ kind: 'text', text: 'שלום\n\nעולם' })
    const u = await extractText(new Uint8Array([1, 2, 3]), 'image.png')
    expect(u.kind).toBe('unsupported')
    expect(u.note).toContain('png')
  })

  it('detects kinds by content first, then by extension', () => {
    expect(detectKind(new TextEncoder().encode('%PDF-1.7'), 'noext')).toBe('pdf')
    expect(detectKind(new Uint8Array([0x50, 0x4b, 3, 4]), 'a.docx')).toBe('docx')
    expect(detectKind(new Uint8Array([0x50, 0x4b, 3, 4]), 'a.xlsx')).toBe('xlsx')
    expect(detectKind(new Uint8Array([0]), 'a.old.xls')).toBe('unsupported')
  })
})
