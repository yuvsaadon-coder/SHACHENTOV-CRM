import { expect, test } from 'vitest'
import seedJson from '../../seed/price-history.json'
import catalogSeed from '../../seed/seed.json'
import { buildHistory, decisionKey, discountRate, periodChanges, priceAt, shiftPeriod, upcomingPeriod, type OfferRecord, type SeedHistory } from '../../src/lib/prices/history'
import { compareSuppliers, groupBySupplier } from '../../src/lib/prices/suppliers'
import { applySupplierChoice } from '../../src/lib/prices/decide'
import type { LegacyProduct } from '../../src/data/legacy'

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

// Two suppliers quote for January 2027. A is cheaper on what both quote, B "looks" cheaper overall only
// because it left out the expensive tahini.
const offer = (key: string, price: number) => ({ key, name: key, productId: key, price })
const recs: OfferRecord[] = [
  { id: 'qa', createdAt: 1, supplierName: 'ספק א', supplierId: 'dry', periodId: '2027-H1', offers: [offer('pasta', 2.7), offer('rice', 6.4), offer('tahini', 9.5)] },
  { id: 'qb', createdAt: 2, supplierName: 'ספק ב ', supplierId: 'dry', periodId: '2027-H1', offers: [offer('pasta', 2.8), offer('rice', 6.5)] },
]

test('supplier comparison uses the same basket for everyone (common products only)', () => {
  const quotes = groupBySupplier(recs, '2027-H1', 'dry')
  expect(quotes.map((q) => q.supplier)).toEqual(['ספק א', 'ספק ב'])     // names trimmed
  const cmp = compareSuppliers(quotes, { relevant: ['pasta', 'rice', 'tahini', 'oil'] })
  expect(cmp.common).toEqual(['pasta', 'rice'])
  expect(cmp.cheapest).toBe('ספק א')
  expect(cmp.rows[0]).toMatchObject({ supplier: 'ספק א', covered: 3, missing: ['oil'] })
  expect(cmp.rows[0]!.equalTotal).toBeCloseTo(9.1, 10)
  expect(cmp.rows[1]!.missing).toEqual(['tahini', 'oil'])
  expect(cmp.rows[1]!.diff).toBeCloseTo(9.3 / 9.1 - 1, 10)
})

test('weights from the voted baskets can change the winner', () => {
  const quotes = groupBySupplier([
    { id: 'x', createdAt: 1, supplierName: 'X', periodId: '2027-H1', offers: [offer('pasta', 3), offer('coffee', 7)] },
    { id: 'y', createdAt: 2, supplierName: 'Y', periodId: '2027-H1', offers: [offer('pasta', 2.5), offer('coffee', 8)] },
  ], '2027-H1')
  expect(compareSuppliers(quotes, { relevant: ['pasta', 'coffee'] }).cheapest).toBe('X')       // 10 vs 10.5
  const w = compareSuppliers(quotes, { relevant: ['pasta', 'coffee'], weights: { pasta: 8, coffee: 1 } })
  expect(w.basis).toBe('weighted')
  expect(w.cheapest).toBe('Y')                                                                   // 27 vs 31
})

test('one supplier per period: before a decision the cheapest is shown provisionally; a decision overrides', () => {
  const h1 = buildHistory(seed, recs, catalog)
  expect(h1.chosen['2027-H1']!.dry).toEqual({ supplier: 'ספק א', provisional: true })
  expect(h1.best['2027-H1']!.pasta!.price).toBe(2.7)
  expect(h1.best['2027-H1']!.tahini!.price).toBe(9.5)        // the chosen supplier's prices, not a per-product mix
  expect(h1.offers['2027-H1']!.pasta).toHaveLength(2)        // other offers kept for comparison
  const decisions = { [decisionKey('2027-H1', 'dry')]: { periodId: '2027-H1', category: 'dry', supplierName: 'ספק ב', decidedAt: 3 } }
  const h2 = buildHistory(seed, recs, catalog, decisions)
  expect(h2.chosen['2027-H1']!.dry).toEqual({ supplier: 'ספק ב', provisional: false })
  expect(h2.best['2027-H1']!.pasta!.price).toBe(2.8)
  expect(h2.best['2027-H1']!.tahini).toBeUndefined()         // B did not offer tahini -> not supplied that period
  expect(h2.chosen['2025-H1']!.dry).toEqual({ supplier: 'ברוכים', provisional: false })
})

test('discount: a separate net layer; list prices and list-to-list changes are untouched', () => {
  expect(discountRate({ type: 'percent', value: 3, baseTotal: null, savedAt: 0 })).toBeCloseTo(0.03)
  expect(discountRate({ type: 'amount', value: 500, baseTotal: 20000, savedAt: 0 })).toBeCloseTo(0.025)
  expect(discountRate({ type: 'amount', value: 500, baseTotal: null, savedAt: 0 })).toBeNull()
  expect(discountRate({ type: 'percent', value: 120, baseTotal: null, savedAt: 0 })).toBeNull()
  const decisions = { [decisionKey('2027-H1', 'dry')]: { periodId: '2027-H1', category: 'dry', supplierName: 'ספק א', decidedAt: 3, discount: { type: 'amount' as const, value: 500, baseTotal: 20000, savedAt: 4 } } }
  const plain = buildHistory(seed, recs, catalog, { [decisionKey('2027-H1', 'dry')]: { ...decisions[decisionKey('2027-H1', 'dry')], discount: null } })
  const disc = buildHistory(seed, recs, catalog, decisions)
  expect(priceAt(disc, '2027-H1', 'pasta', 'list')).toBe(2.7)
  expect(priceAt(disc, '2027-H1', 'pasta', 'net')).toBeCloseTo(2.7 * 0.975, 10)
  expect(priceAt(disc, '2026-H2', 'pasta', 'net')).toBe(2.596)        // no discount recorded -> net = list
  expect(periodChanges(disc, 'list').at(-1)!.change).toBeCloseTo(periodChanges(plain, 'list').at(-1)!.change!, 12)
  // net change = list change shifted by exactly the discount, the same for every product (no distortion between products)
  const l = periodChanges(disc, 'list').at(-1)!.change!, n = periodChanges(disc, 'net').at(-1)!.change!
  expect(1 + n).toBeCloseTo((1 + l) * 0.975, 10)
})

test('choosing a supplier updates catalog prices, adds its new products, and lists what it does not offer', () => {
  const products = (catalogSeed as unknown as { products: LegacyProduct[] }).products
  const [quote] = groupBySupplier([{ id: 'q', createdAt: 1, supplierName: 'ספק א', supplierId: 'dry', periodId: '2027-H1',
    offers: [offer('pasta', 2.7), { key: 'name:דבש', name: 'דבש', productId: null, price: 15, emoji: '🍯', cat: 'dry' as const }] }], '2027-H1')
  const res = applySupplierChoice(products, quote!, { idPrefix: 's1', supplierId: 'dry' })
  expect(res).toMatchObject({ updated: 1, added: 1 })
  expect(res.products.find((p) => p.id === 'pasta')!.price).toBe(2.7)
  expect(res.products.at(-1)).toMatchObject({ id: 's1-0', name: 'דבש', emoji: '🍯', price: 15 })
  expect(res.notOffered).toContain('rice')
  expect(res.notOffered).not.toContain('eggs')     // other supplier category
  // choosing the same supplier again does not add the product twice
  expect(applySupplierChoice(res.products, quote!, { idPrefix: 's2', supplierId: 'dry' }).added).toBe(0)
})

test('choosing a supplier can hide products it did not quote, and shows them again when a later choice offers them', () => {
  const products = (catalogSeed as unknown as { products: LegacyProduct[] }).products
  const [q1] = groupBySupplier([{ id: 'q1', createdAt: 1, supplierName: 'A', supplierId: 'dry', periodId: '2027-H1', offers: [offer('pasta', 2.7)] }], '2027-H1')
  const r1 = applySupplierChoice(products, q1!, { idPrefix: 's1', supplierId: 'dry', hideNotOffered: true })
  expect(r1.products.find((p) => p.id === 'rice')!.active).toBe(false)
  expect(r1.products.find((p) => p.id === 'pasta')!.active).not.toBe(false)
  expect(r1.products.find((p) => p.id === 'eggs')!.active).not.toBe(false)   // other category untouched
  const [q2] = groupBySupplier([{ id: 'q2', createdAt: 2, supplierName: 'B', supplierId: 'dry', periodId: '2027-H2', offers: [offer('pasta', 2.8), offer('rice', 6)] }], '2027-H2')
  const r2 = applySupplierChoice(r1.products, q2!, { idPrefix: 's2', supplierId: 'dry', hideNotOffered: true })
  expect(r2.products.find((p) => p.id === 'rice')!.active).toBe(true)
})
