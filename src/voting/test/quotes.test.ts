import { expect, test } from 'vitest'
import seedJson from '../seed/seed.json'
import { bestMatch, normalizeName, similarity } from '../lib/quotes/match'
import { guessEmoji } from '../lib/quotes/emoji'
import { chunkLines, linesFromRows, linesFromText, parseNumber, rowsToText } from '../lib/quotes/heuristics'
import { applyProposals, buildProposals, finalPrice, pctChange } from '../lib/quotes/plan'
import type { LegacyProduct } from '../data/model'
import type { QuoteLine } from '../lib/quotes/types'

const products = (seedJson as unknown as { products: LegacyProduct[] }).products
const catalog = products.map((p) => ({ id: p.id, name: p.name, price: p.price }))

test('normalisation removes niqqud, quotes and final letters', () => {
  expect(normalizeName('שֶׁמֶן קָנוֹלָה 1 ל\'')).toBe('שמנ קנולה 1 ל')
  expect(similarity('פסטה', 'פסטה')).toBe(1)
})

test('quote names match catalog products despite sizes, brands and packaging words', () => {
  expect(bestMatch('פסטה פנה 500 גרם', catalog)?.id).toBe('pasta')
  expect(bestMatch('אורז פרסי 1 ק"ג', catalog)?.id).toBe('rice')
  expect(bestMatch('טונה בשמן 160 גר', catalog)?.id).toBe('tuna')
  expect(bestMatch('שמן קנולה 1 ליטר', catalog)?.id).toBe('oil')
  expect(bestMatch('קמח לבן 1 קג', catalog)?.id).toBe('flour')
  expect(bestMatch('מגבונים לחים', catalog)).toBeNull()
})

test('emoji guess for new products', () => {
  expect(guessEmoji('דבש טהור 500 גרם').emoji).toBe('🍯')
  expect(guessEmoji('שמן זית').emoji).toBe('🫒')
  expect(guessEmoji('חזה עוף').cat).toBe('fresh')
  expect(guessEmoji('משהו לא מוכר').emoji).toBe('🛒')
})

test('parseNumber handles shekel signs and thousands separators', () => {
  expect(parseNumber('₪ 1,234.50')).toBe(1234.5)
  expect(parseNumber('אין')).toBeNull()
})

test('rows with a header: name and unit-price columns are found, totals ignored', () => {
  const rows = [
    ['הצעת מחיר - ספק יבשים', '', '', ''],
    ['מחירים לפני מע"מ', '', '', ''],
    ['מק"ט', 'תיאור פריט', 'מחיר ליחידה', 'סה"כ'],
    ['1001', 'פסטה פנה 500 גרם', '2.35', '235'],
    ['1002', 'דבש 500 גרם', '12.90', '129'],
    ['', 'סה"כ', '', '364'],
  ]
  const lines = linesFromRows(rows, catalog)
  expect(lines.map((l) => [l.name, l.unitPrice, l.matchId, l.vatIncluded])).toEqual([
    ['פסטה פנה 500 גרם', 2.35, 'pasta', false],
    ['דבש 500 גרם', 12.9, null, false],
  ])
})

test('rows without a header: longest text cell + decimal number', () => {
  const lines = linesFromRows([['7290001', 'אורז פרסי 1 קג', '24', '5.90']], catalog)
  expect(lines[0]).toMatchObject({ unitPrice: 5.9, matchId: 'rice' })
})

test('free text lines', () => {
  const lines = linesFromText('הצעת מחיר\nטונה בשמן 160 גר 3.10 ₪\nקפה נמס 200 גר - 14.50\nתודה רבה', catalog)
  expect(lines.map((l) => [l.matchId, l.unitPrice])).toEqual([['tuna', 3.1], ['coffee', 14.5]])
})

test('chunking repeats the header and keeps every line', () => {
  const lines = Array.from({ length: 95 }, (_, i) => `row ${i}`)
  const chunks = chunkLines(lines, 40, 3)
  expect(chunks).toHaveLength(3)
  expect(chunks.every((c) => c.startsWith('row 0\nrow 1\nrow 2'))).toBe(true)
  expect(chunks.join('\n').split('\n').filter((l) => !['row 0', 'row 1', 'row 2'].includes(l))).toHaveLength(92)
  expect(rowsToText([['a', '', 'b'], ['', '']])).toEqual(['a | b'])
})

const line = (o: Partial<QuoteLine>): QuoteLine => ({ name: 'x', unitPrice: 10, vatIncluded: null, matchId: null, emoji: '🛒', cat: 'dry', confidence: 1, note: '', ...o })

test('VAT: before-VAT prices get 18% added; auto mode follows the quote', () => {
  expect(finalPrice(line({ unitPrice: 10, vatIncluded: false }), 'auto')).toBe(11.8)
  expect(finalPrice(line({ unitPrice: 10, vatIncluded: null }), 'auto')).toBe(10)
  expect(finalPrice(line({ unitPrice: 10, vatIncluded: true }), 'excluded')).toBe(11.8)
  expect(finalPrice(line({ unitPrice: 10, vatIncluded: false }), 'included')).toBe(10)
  expect(finalPrice(line({ unitPrice: null }), 'auto')).toBeNull()
})

test('proposals: update matched, add new, ignore duplicates and unpriced; apply changes the catalog', () => {
  const lines = [
    line({ name: 'פסטה פנה', unitPrice: 2.9, matchId: 'pasta' }),
    line({ name: 'פסטה ספגטי', unitPrice: 3.1, matchId: 'pasta' }),
    line({ name: 'דבש', unitPrice: 12.9, emoji: '🍯' }),
    line({ name: 'ללא מחיר', unitPrice: null }),
  ]
  const props = buildProposals(lines, catalog, 'auto')
  expect(props.map((p) => p.action)).toEqual(['update', 'ignore', 'add', 'ignore'])
  expect(props[0]).toMatchObject({ oldPrice: 2.6, newPrice: 2.9 })
  const res = applyProposals(products, props, { supplierId: 'dry', idPrefix: 'q1' })
  expect(res).toMatchObject({ updated: 1, added: 1 })
  expect(res.products.find((p) => p.id === 'pasta')!.price).toBe(2.9)
  expect(res.products.at(-1)).toMatchObject({ name: 'דבש', price: 12.9, emoji: '🍯', supplier: 'dry', max: 10 })
  expect(products.find((p) => p.id === 'pasta')!.price).toBe(2.6) // input not mutated
  expect(pctChange(2.6, 2.9)).toBeCloseTo(11.54, 1)
})
