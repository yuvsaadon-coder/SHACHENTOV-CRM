// One supplier per half-year order (owner 19.11.2026). Compare whole quotes fairly and pick one. Pure.
//
// Fair comparison = the same basket for everyone: only catalog products that EVERY supplier quoted
// ("common products"). A supplier that left products out cannot look cheaper because of it; its gaps are
// listed instead. Two totals are shown: one unit of each common product (like the owner's sheet), and,
// when voting results exist, weighted by the quantities in the current weighted baskets.
import type { OfferRecord, PeriodId } from './history'

export interface OfferMeta { name: string; productId: string | null; emoji?: string; cat?: 'dry' | 'fresh' }
export interface SupplierQuote {
  supplier: string
  prices: Record<string, number>
  meta: Record<string, OfferMeta>
  quoteIds: string[]
  lastAt: number
}

export const supplierKey = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Supplier category of a quote record ('' = not set, treated as dry goods). */
export const categoryOf = (r: { supplierId?: string }) => r.supplierId || 'dry'

/** All quotes of one category for a period, one entry per supplier. A later quote of the same supplier replaces its earlier prices. */
export function groupBySupplier(records: OfferRecord[], periodId: PeriodId, category = 'dry'): SupplierQuote[] {
  const by = new Map<string, SupplierQuote>()
  for (const r of [...records].filter((x) => x.periodId === periodId && categoryOf(x) === category && x.offers?.length).sort((a, b) => a.createdAt - b.createdAt)) {
    const k = supplierKey(r.supplierName)
    const q = by.get(k) ?? { supplier: k, prices: {}, meta: {}, quoteIds: [], lastAt: 0 }
    for (const o of r.offers!) {
      if (!(o.price > 0)) continue
      q.prices[o.key] = o.price
      q.meta[o.key] = { name: o.name, productId: o.productId, emoji: o.emoji, cat: o.cat }
    }
    q.quoteIds.push(r.id)
    q.lastAt = r.createdAt
    by.set(k, q)
  }
  return [...by.values()]
}

export interface SupplierRow {
  supplier: string
  /** catalog products this supplier quoted */
  covered: number
  /** catalog products it did not quote */
  missing: string[]
  equalTotal: number
  weightedTotal: number | null
  /** fraction above the cheapest on the chosen basis (0 for the cheapest) */
  diff: number
}

export interface Comparison {
  common: string[]
  basis: 'weighted' | 'equal'
  rows: SupplierRow[]
  cheapest: string | null
}

export function compareSuppliers(quotes: SupplierQuote[], opts: { relevant: string[]; weights?: Record<string, number> | null }): Comparison {
  const relevant = new Set(opts.relevant)
  const common = opts.relevant.filter((k) => quotes.length > 0 && quotes.every((q) => q.prices[k] != null))
  const w = opts.weights ?? null
  const weighted = !!w && common.some((k) => (w[k] ?? 0) > 0)
  const rows = quotes.map((q) => {
    const equalTotal = common.reduce((s, k) => s + q.prices[k]!, 0)
    const weightedTotal = weighted ? common.reduce((s, k) => s + q.prices[k]! * (w![k] ?? 0), 0) : null
    const coveredKeys = Object.keys(q.prices).filter((k) => relevant.has(k))
    return {
      supplier: q.supplier, covered: coveredKeys.length, missing: opts.relevant.filter((k) => q.prices[k] == null),
      equalTotal, weightedTotal, diff: 0,
    }
  })
  const total = (r: SupplierRow) => (weighted ? r.weightedTotal! : r.equalTotal)
  rows.sort((a, b) => total(a) - total(b) || b.covered - a.covered || (a.supplier < b.supplier ? -1 : 1))
  const best = rows[0]
  for (const r of rows) r.diff = best && total(best) > 0 ? total(r) / total(best) - 1 : 0
  return { common, basis: weighted ? 'weighted' : 'equal', rows, cheapest: common.length ? best?.supplier ?? null : rows[0]?.supplier ?? null }
}

/** Units of each product in one set of the current weighted baskets: the basket used to weigh supplier totals. */
export function basketWeights(results: { baskets: Record<string, { winners: { pid: string; qty: number }[] }> }): Record<string, number> | null {
  const w: Record<string, number> = {}
  for (const b of Object.values(results.baskets)) for (const x of b.winners) w[x.pid] = (w[x.pid] ?? 0) + x.qty
  return Object.keys(w).length ? w : null
}
