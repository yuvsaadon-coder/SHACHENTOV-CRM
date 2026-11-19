import { expect, test } from 'vitest'
import seedJson from '../../seed/price-history.json'
import catalogSeed from '../../seed/seed.json'
import { buildHistory, periodChanges, previousPrice, shiftPeriod, upcomingPeriod, type SeedHistory } from '../../src/lib/prices/history'

const seed = seedJson as unknown as SeedHistory
const catalog = (catalogSeed as unknown as { products: { id: string; name: string }[] }).products

test('period arithmetic', () => {
  expect(shiftPeriod('2026-H2', 1)).toBe('2027-H1')
  expect(shiftPeriod('2026-H1', -1)).toBe('2025-H2')
  expect(upcomingPeriod(2026, 11)).toBe('2027-H1')
  expect(upcomingPeriod(2027, 2)).toBe('2027-H2')
})

test('the imported spreadsheet: 27 items, 7 half-years from July 2023', () => {
  const h = buildHistory(seed, [], catalog)
  expect(h.periods).toEqual(['2023-H2', '2024-H1', '2024-H2', '2025-H1', '2025-H2', '2026-H1', '2026-H2'])
  expect(h.items).toHaveLength(27)
  expect(h.best['2025-H1']!.pasta).toMatchObject({ price: 2.59, supplier: 'ברוכים' })
  expect(h.best['2023-H2']!.pasta).toBeUndefined() // 0 in the file = not supplied
})

test('half-year changes reproduce the owner spreadsheet row "שינוי ביחס להזמנה קודמת"', () => {
  const ch = periodChanges(buildHistory(seed, [], catalog))
  const expected = [0.07632454759, 0.03066222114, 0.02776847278, -0.01303424807, 0.02552706913, 0.02001819836]
  ch.slice(1).forEach((c, i) => expect(c.change).toBeCloseTo(expected[i]!, 8))
  expect(ch[0]!.index).toBe(100)
  // year change is chained: (1+a)(1+b)-1, not a+b
  expect(ch[2]!.yearChange).toBeCloseTo((1 + expected[0]!) * (1 + expected[1]!) - 1, 10)
})

test('normalisation: new and discontinued products are listed, not mixed into the change', () => {
  const ch = periodChanges(buildHistory(seed, [], catalog))
  const jul26 = ch.find((c) => c.period === '2026-H2')!
  expect(jul26.newKeys).toContain('name:אפונה וגזר')
  const jan25 = ch.find((c) => c.period === '2025-H1')!
  expect(jan25.droppedKeys).toContain('grape')
})

test('quotes add offers; the cheapest offer per product wins', () => {
  const recs = [
    { id: 'q1', createdAt: 1, supplierName: 'ספק א', periodId: '2027-H1', offers: [{ key: 'pasta', name: 'פסטה', productId: 'pasta', price: 2.9 }, { key: 'rice', name: 'אורז', productId: 'rice', price: 6.5 }] },
    { id: 'q2', createdAt: 2, supplierName: 'ספק ב', periodId: '2027-H1', offers: [{ key: 'pasta', name: 'פסטה', productId: 'pasta', price: 2.7 }, { key: 'q2-0', name: 'דבש', productId: 'q2-0', price: 15 }] },
  ]
  const h = buildHistory(seed, recs, [...catalog, { id: 'q2-0', name: 'דבש' }])
  expect(h.periods.at(-1)).toBe('2027-H1')
  expect(h.best['2027-H1']!.pasta).toMatchObject({ price: 2.7, supplier: 'ספק ב', source: 'quote' })
  expect(h.offers['2027-H1']!.pasta!.map((o) => o.price)).toEqual([2.7, 2.9])
  const last = periodChanges(h).at(-1)!
  expect(last.compared).toBe(2)               // pasta + rice; honey is new
  expect(last.newKeys).toEqual(['q2-0'])
  expect(last.change).toBeCloseTo((2.7 + 6.5) / (2.596 + 6.608) - 1, 10)
  expect(previousPrice(h, 'pasta', '2027-H1')).toMatchObject({ period: '2026-H2' })
})

test('a history-only item that later enters the catalog is tracked under the product id', () => {
  const h = buildHistory(seed, [], [...catalog, { id: 'p-new', name: 'אפונה וגזר' }])
  expect(h.best['2026-H2']!['p-new']).toBeDefined()
  expect(h.items.find((i) => i.key === 'name:אפונה וגזר')).toBeUndefined()
})

test('excel export rows follow the owner layout (price, then % column per period)', async () => {
  const { trackingRows } = await import('../../src/features/admin/PricesPanel')
  const h = buildHistory(seed, [], catalog)
  const t = trackingRows(h, periodChanges(h), () => 'ספק')
  expect(t.heads).toHaveLength(1 + 7 + 6)
  expect(t.heads.slice(0, 4)).toEqual(['מוצרים', 'מחיר כולל מעמ', 'מחיר כולל מעמ', 'שינוי אחוזי'])
  const pasta = t.items.find((r) => r[0] === 'פסטה')!
  expect(pasta[1]).toBeNull()          // July 2023: not supplied
  expect(pasta[2]).toBe(3)             // January 2024
  expect(pasta[4]).toBe(2.6)           // July 2024
  expect(pasta[5]).toBeCloseTo(-0.1333, 3) // July 2024 vs January 2024
  expect(t.change[3]).toBeCloseTo(0.0763245, 6)
})
