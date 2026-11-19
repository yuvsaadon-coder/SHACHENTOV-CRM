// Multi-year price tracking (owner request 19.11.2026). Pure: no Firebase, no DOM, no Date.now().
//
// A period is one half-year order: 'YYYY-H1' (January) or 'YYYY-H2' (July).
// Sources: the owner's historical spreadsheet (seed/price-history.json) + every applied supplier quote.
// ONE supplier per period: the tracked prices of a period are those of the chosen supplier (the decision), or,
// while no supplier was chosen yet, of the cheapest supplier on a common basket (marked provisional).
// Discounts are negotiated per order after quantities are known. They are kept as a separate "net" layer
// (rate applied to every unit price, i.e. split in proportion to each product's value in the order) and never
// written into list prices, so list-vs-list and net-vs-net comparisons never mix.
// Normalisation: the change between two periods is computed only over products supplied in BOTH
// (sum of current prices / sum of previous prices - 1), exactly like the owner's spreadsheet;
// products that are new or no longer supplied are listed, not mixed into the change.
import { normalizeName } from '../quotes/match'
import { categoryOf, compareSuppliers, groupBySupplier, supplierKey } from './suppliers'

export type PeriodId = string

export interface HistoryItem { key: string; name: string; productId: string | null; category: string }
export interface SeedHistory {
  items: HistoryItem[]
  periods: { id: PeriodId; supplier: string; prices: Record<string, number> }[]
}
export interface OfferRecord {
  id: string
  createdAt: number
  supplierName: string
  /** supplier category (dry, eggs, poultry, vegetables, bermann); '' = dry */
  supplierId?: string
  periodId?: PeriodId
  offers?: { key: string; name: string; productId: string | null; price: number; emoji?: string; cat?: 'dry' | 'fresh' }[]
}

export interface Discount {
  type: 'percent' | 'amount'
  value: number
  /** order total before the discount (needed for an amount discount) */
  baseTotal: number | null
  note?: string
  savedAt: number
}
export interface PeriodDecision {
  periodId: PeriodId
  category: string
  supplierName: string
  decidedAt: number
  discount?: Discount | null
}

/** Effective discount rate in [0,1), or null when it cannot be computed. */
export function discountRate(d: Discount | null | undefined): number | null {
  if (!d || !(d.value > 0)) return null
  const r = d.type === 'percent' ? d.value / 100 : d.baseTotal && d.baseTotal > 0 ? d.value / d.baseTotal : null
  return r != null && r > 0 && r < 1 ? r : null
}

export type Layer = 'list' | 'net'

/** Decisions are per half-year AND supplier category (one dry-goods supplier, one egg supplier, …). */
export const decisionKey = (periodId: PeriodId, category: string) => `${periodId}|${category}`
export interface Offer {
  key: string
  category: string
  price: number
  supplier: string
  source: 'history' | 'quote'
  quoteId?: string
  date?: number
}
export interface PriceHistory {
  periods: PeriodId[]
  items: HistoryItem[]
  /** the chosen (or provisional) supplier's offer per period per item */
  best: Record<PeriodId, Record<string, Offer>>
  /** every offer per period per item, cheapest first */
  offers: Record<PeriodId, Record<string, Offer[]>>
  /** supplier whose prices the period uses, per category */
  chosen: Record<PeriodId, Record<string, { supplier: string; provisional: boolean }>>
  /** discount rate per period and category (net layer); 0 = none */
  rate: Record<PeriodId, Record<string, number>>
}

const EPS = 1e-9
const PERIOD_RE = /^(\d{4})-H([12])$/

export function isPeriodId(id: string): boolean { return PERIOD_RE.test(id) }

/** Half-year period a calendar date falls in (dates given as y/m/d to stay timezone-free). */
export function periodOf(year: number, month1to12: number): PeriodId {
  return `${year}-H${month1to12 <= 6 ? 1 : 2}`
}

export function shiftPeriod(id: PeriodId, n: number): PeriodId {
  const m = PERIOD_RE.exec(id)
  if (!m) throw new Error(`bad period ${id}`)
  const idx = Number(m[1]) * 2 + (Number(m[2]) - 1) + n
  return `${Math.floor(idx / 2)}-H${(idx % 2) + 1}`
}

/** The order period that starts after the given date (the one quotes are usually collected for). */
export function upcomingPeriod(year: number, month1to12: number): PeriodId {
  return shiftPeriod(periodOf(year, month1to12), 1)
}

export function periodStart(id: PeriodId): { year: number; month: number } {
  const m = PERIOD_RE.exec(id)
  if (!m) throw new Error(`bad period ${id}`)
  return { year: Number(m[1]), month: m[2] === '1' ? 1 : 7 }
}

const cmpPeriod = (a: PeriodId, b: PeriodId) => (a < b ? -1 : a > b ? 1 : 0)

export function buildHistory(
  seed: SeedHistory, records: OfferRecord[], catalog: { id: string; name: string; supplier?: string }[],
  decisions: Record<PeriodId, PeriodDecision> = {}, weights: Record<string, number> | null = null,
): PriceHistory {
  const catalogByName = new Map(catalog.map((p) => [normalizeName(p.name), p]))
  const catOfProduct = new Map(catalog.map((p) => [p.id, p.supplier || 'dry']))
  const catalogById = new Map(catalog.map((p) => [p.id, p]))
  const items = new Map<string, HistoryItem>()
  /** history-only names that now exist in the catalog are tracked under the product id */
  const rekey = new Map<string, string>()

  const addItem = (key: string, name: string, productId: string | null, category = 'dry'): string => {
    let k = key, pid = productId
    if (!pid) {
      const p = catalogByName.get(normalizeName(name))
      if (p) { rekey.set(key, p.id); k = p.id; pid = p.id }
    }
    if (!items.has(k)) items.set(k, { key: k, name: (pid && catalogById.get(pid)?.name) || name, productId: pid, category: (pid && catOfProduct.get(pid)) || category })
    return k
  }

  const offers: PriceHistory['offers'] = {}
  const push = (period: PeriodId, o: Offer) => {
    const per = (offers[period] ??= {})
    ;(per[o.key] ??= []).push(o)
  }

  for (const it of seed.items) addItem(it.key, it.name, it.productId)
  for (const p of seed.periods) {
    for (const [key, price] of Object.entries(p.prices)) {
      if (!(price > 0)) continue
      push(p.id, { key: rekey.get(key) ?? key, category: 'dry', price, supplier: supplierKey(p.supplier), source: 'history' })
    }
  }
  for (const r of records) {
    if (!r.periodId || !isPeriodId(r.periodId) || !r.offers) continue
    for (const o of r.offers) {
      if (!(o.price > 0)) continue
      const key = addItem(o.key, o.name, o.productId, categoryOf(r))
      push(r.periodId, { key, category: categoryOf(r), price: o.price, supplier: supplierKey(r.supplierName), source: 'quote', quoteId: r.id, date: r.createdAt })
    }
  }

  // who supplies each period: decision > historical record > cheapest quote (provisional)
  const seedSupplier = new Map(seed.periods.map((p) => [p.id, supplierKey(p.supplier)]))
  const chosen: PriceHistory['chosen'] = {}
  const rate: PriceHistory['rate'] = {}
  const recordsRekeyed = records.map((r) => ({ ...r, offers: r.offers?.map((o) => ({ ...o, key: rekey.get(o.key) ?? (o.productId ? o.key : catalogByName.get(normalizeName(o.name))?.id ?? o.key) })) }))
  for (const [period, per] of Object.entries(offers)) {
    chosen[period] = {}
    rate[period] = {}
    const cats = new Set(Object.values(per).flat().map((o) => o.category))
    for (const cat of cats) {
      const d = decisions[decisionKey(period, cat)]
      if (d?.supplierName) chosen[period]![cat] = { supplier: supplierKey(d.supplierName), provisional: false }
      else if (cat === 'dry' && seedSupplier.has(period)) chosen[period]![cat] = { supplier: seedSupplier.get(period)!, provisional: false }
      else {
        const relevant = catalog.filter((p) => (p.supplier || 'dry') === cat).map((p) => p.id)
        const cmp = compareSuppliers(groupBySupplier(recordsRekeyed, period, cat), { relevant, weights })
        chosen[period]![cat] = { supplier: cmp.cheapest ?? '', provisional: true }
      }
      rate[period]![cat] = discountRate(d?.discount) ?? 0
    }
  }

  const best: PriceHistory['best'] = {}
  for (const [period, per] of Object.entries(offers)) {
    best[period] = {}
    for (const [key, list] of Object.entries(per)) {
      list.sort((a, b) => a.price - b.price || (a.date ?? 0) - (b.date ?? 0))
      // the chosen supplier's latest price for the item; other suppliers' offers stay in `offers` for comparison
      const mine = list.filter((o) => o.supplier === chosen[period]![o.category]?.supplier).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0]
      if (mine) best[period]![key] = mine
    }
  }

  // catalog order first, then history-only items
  const order = new Map(catalog.map((p, i) => [p.id, i]))
  const sortedItems = [...items.values()].sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9))
  return { periods: Object.keys(offers).sort(cmpPeriod), items: sortedItems, best, offers, chosen, rate }
}

export interface PeriodChange {
  period: PeriodId
  previous: PeriodId | null
  /** null when there is no previous period or nothing in common */
  change: number | null
  compared: number
  newKeys: string[]
  droppedKeys: string[]
  /** chained index, first period = 100 */
  index: number
  /** change versus the same half one year earlier (chained), null if that period is missing */
  yearChange: number | null
}

/** Price of an item in a period on the given layer. */
export function priceAt(h: PriceHistory, period: PeriodId, key: string, layer: Layer = 'list'): number | null {
  const o = h.best[period]?.[key]
  if (!o) return null
  return layer === 'net' ? o.price * (1 - (h.rate[period]?.[o.category] ?? 0)) : o.price
}

export function periodChanges(h: PriceHistory, layer: Layer = 'list'): PeriodChange[] {
  const out: PeriodChange[] = []
  h.periods.forEach((period, i) => {
    const cur = h.best[period] ?? {}
    const previous = i > 0 ? h.periods[i - 1]! : null
    const prev = previous ? h.best[previous] ?? {} : {}
    const common = Object.keys(cur).filter((k) => prev[k])
    let change: number | null = null
    if (previous && common.length) {
      const a = common.reduce((s, k) => s + priceAt(h, period, k, layer)!, 0)
      const b = common.reduce((s, k) => s + priceAt(h, previous, k, layer)!, 0)
      change = b > EPS ? a / b - 1 : null
    }
    const index = i === 0 ? 100 : out[i - 1]!.index * (1 + (change ?? 0))
    const yearAgo = shiftPeriod(period, -2)
    const j = out.findIndex((c) => c.period === yearAgo)
    out.push({
      period, previous, change, compared: common.length,
      newKeys: previous ? Object.keys(cur).filter((k) => !prev[k]) : [],
      droppedKeys: previous ? Object.keys(prev).filter((k) => !cur[k]) : [],
      index,
      yearChange: j >= 0 ? index / out[j]!.index - 1 : null,
    })
  })
  return out
}

/** Previous tracked price of an item before a period (for per-item change). */
export function previousPrice(h: PriceHistory, key: string, period: PeriodId): { period: PeriodId; offer: Offer } | null {
  for (let i = h.periods.indexOf(period) - 1; i >= 0; i--) {
    const o = h.best[h.periods[i]!]?.[key]
    if (o) return { period: h.periods[i]!, offer: o }
  }
  return null
}
