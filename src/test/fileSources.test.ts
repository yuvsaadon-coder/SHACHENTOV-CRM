import { describe, expect, it, vi } from 'vitest'

vi.mock('node:crypto', async (orig) => orig())

import { classifyUrl, SourceCollector } from '../../netlify/functions/_fileSources'

const ORIGIN = 'https://crm.example.org'

describe('classifyUrl', () => {
  it('treats files of the site, relative or absolute, as the same static file', () => {
    const a = classifyUrl('/templates/hagim/sapak-beitzim-pesach.xlsx', ORIGIN)
    const b = classifyUrl(`${ORIGIN}/templates/hagim/sapak-beitzim-pesach.xlsx`, ORIGIN)
    expect(a.kind).toBe('static')
    expect(a.key).toBe(b.key)
    expect(a.key).toBe('static:templates/hagim/sapak-beitzim-pesach.xlsx')
  })

  it('decodes Hebrew file names so the key matches the list of static files', () => {
    const c = classifyUrl('/templates/%D7%97%D7%9C%D7%95%D7%A7%D7%AA-%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D.xlsx', ORIGIN)
    expect(c.key).toBe('static:templates/חלוקת-ירושלים.xlsx')
    expect(classifyUrl('/templates/חלוקת-ירושלים.xlsx', ORIGIN).key).toBe(c.key)
  })

  it('knows Firebase Storage files, inline data, and plain links', () => {
    expect(classifyUrl('https://firebasestorage.googleapis.com/v0/b/x/o/a.pdf?alt=media&token=1', ORIGIN).kind).toBe('storage')
    expect(classifyUrl('data:application/pdf;base64,AAAA', ORIGIN).kind).toBe('data')
    expect(classifyUrl('https://docs.google.com/document/d/1', ORIGIN).kind).toBe('link')
    expect(classifyUrl('https://evil.example/templates/x.pdf', ORIGIN).kind).toBe('link')
  })
})

describe('SourceCollector', () => {
  it('lists one entry per file with every place it is attached', () => {
    const c = new SourceCollector(ORIGIN)
    c.add('/templates/hagim/a.xlsx', 'פורמט לספק', { type: 'task', id: 'JLM-07', label: 'משימה JLM-07' })
    c.add('/templates/hagim/a.xlsx', 'פורמט לספק', { type: 'task', id: 'JLM-08', label: 'משימה JLM-08' })
    c.add('/templates/hagim/a.xlsx', 'a.xlsx', { type: 'task', id: 'JLM-08', label: 'משימה JLM-08' })
    const r = c.result([])
    expect(r.files).toHaveLength(1)
    expect(r.files[0].name).toBe('פורמט לספק')
    expect(r.files[0].places.map((p) => p.id)).toEqual(['JLM-07', 'JLM-08'])
  })

  it('keeps web links apart from files, and ignores empty values', () => {
    const c = new SourceCollector(ORIGIN)
    c.add('https://example.org/page', 'דף', { type: 'hq_partners', id: 'p', label: 'שותף' })
    c.add('', 'x', { type: 't', id: 'i', label: 'l' })
    c.add(undefined, 'x', { type: 't', id: 'i', label: 'l' })
    const r = c.result([])
    expect(r.files).toHaveLength(0)
    expect(r.links).toHaveLength(1)
  })
})
