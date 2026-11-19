import { describe, expect, it } from 'vitest'
import { chunkText, groupByDoc, queryTokens, rankChunks, selectWithinBudget, tokenize, type RetrievalDoc } from '../../netlify/functions/_retrieval'

describe('tokenize', () => {
  it('drops stop words and normalises Hebrew prefixes, endings and final letters', () => {
    expect(tokenize('כמה סלים מחלקים בסניפי ירושלים?')).toEqual(expect.arrayContaining(['סלימ', 'סניפ', 'ירושל']))
    expect(tokenize('הסניפים')).toEqual(tokenize('סניף'))
    expect(tokenize('סניפי')).toEqual(tokenize('סניף'))
    expect(tokenize('של את על')).toEqual([])
  })
  it('keeps numbers and latin words', () => {
    expect(tokenize('JLM-07 2026')).toEqual(['jlm', '07', '2026'])
  })
})

describe('chunkText', () => {
  it('returns one chunk for short text and overlapping chunks for long text', () => {
    expect(chunkText('קצר')).toEqual(['קצר'])
    const long = Array.from({ length: 400 }, (_, i) => `משפט מספר ${i}`).join('. ')
    const chunks = chunkText(long, 1500, 200)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.every((c) => c.length <= 1500)).toBe(true)
    expect(chunks.join(' ')).toContain('משפט מספר 399')
  })
})

const docs: RetrievalDoc[] = [
  { id: 'a', title: 'חלוקת-ירושלים.xlsx', label: 'תבניות ומסמכי מערכת', text: 'רשימת רכזי סניפי ירושלים: נחלאות, בית הכרם, קטמון' },
  { id: 'b', title: 'מסמך-חפיפה.pdf', label: 'תבניות ומסמכי מערכת', text: 'מנהל חלוקת סלי מזון בית שמש רושי פרידמן' },
  { id: 'c', title: 'תקציב 2026', label: 'דוחות כספיים', text: 'הכנסות מתרומות והוצאות שכר ותפעול' },
]

describe('rankChunks', () => {
  it('picks the file whose name and text match the question', () => {
    const ranked = rankChunks(docs, queryTokens('מי הרכזים בחלוקת ירושלים?'))
    expect(ranked[0].docId).toBe('a')
  })
  it('finds a record by a word in its text, through Hebrew prefixes', () => {
    const ranked = rankChunks(docs, queryTokens('מי מנהל החלוקה בבית שמש'))
    expect(ranked[0].docId).toBe('b')
  })
  it('returns nothing for an empty question', () => {
    expect(rankChunks(docs, queryTokens('מה'))).toEqual([])
  })
})

describe('selectWithinBudget', () => {
  it('stays inside the budget and counts what did not fit', () => {
    const ranked = rankChunks(docs, queryTokens('ירושלים חלוקת סלי מזון תרומות'))
    const sel = selectWithinBudget(ranked, 70)
    expect(sel.used).toBeLessThanOrEqual(70)
    expect(sel.chosen.length + sel.omitted).toBe(ranked.length)
  })
  it('limits how many pieces one document may contribute', () => {
    const big: RetrievalDoc = { id: 'x', title: 'ארוך', label: 'ירושלים', text: Array.from({ length: 200 }, () => 'ירושלים סניפים חלוקה').join('\n') }
    const sel = selectWithinBudget(rankChunks([big], queryTokens('ירושלים'), 200), 1_000_000, 3)
    expect(sel.chosen.length).toBe(3)
    expect(groupByDoc(sel.chosen)).toHaveLength(1)
  })
})
