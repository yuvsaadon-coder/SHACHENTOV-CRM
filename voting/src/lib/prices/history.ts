// Multi-year price tracking (owner request 19.11.2026). Pure: no Firebase, no DOM, no Date.now().
//
// A period is one half-year order: 'YYYY-H1' (January) or 'YYYY-H2' (July).
// Sources: the owner's historical spreadsheet (seed/price-history.json) + every applied supplier quote.
// For each product and period the tracked price is the CHEAPEST offer received.
// Normalisation: the change between two periods is computed only over products supplied in BOTH
// (sum of current prices / sum of previous prices - 1), exactly like the owner's spreadsheet;
// products that are new or no longer supplied are listed, not mixed into the change.
import { normalizeName } from '../quotes/match'

export type PeriodId = string

export interface HistoryItem { key: string; name: string; productId: string | null }
export interface SeedHistory {
  items: HistoryItem[]
  periods: { id: PeriodId; supplier: string; prices: Record<string, number> }[]
}
export interface OfferRecord {
  id: string
  createdAt: number
  supplierName: string
  periodId?: PeriodId
  offers?: { key: string; name: string; productId: string | null; price: number }[]
}
export interface Offer {
  key: string
  price: number
  supplier: string
  source: 'history' | 'quote'
  quoteId?: string
  date?: number
}
export interface PriceHistory {
  periods: PeriodId[]
  items: HistoryItem[]
  /** cheapest offer per period per item */
  best: Record<PeriodId, Record<string, Offer>>
  /** every offer per period per item, cheapest first */
  offers: Record<PeriodId, Record<string, Offer[]>>
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

export function buildHistory(seed: SeedHistory, records: OfferRecord[], catalog: { id: string; name: string }[]): PriceHistory {
  const catalogByName = new Map(catalog.map((p) => [normalizeName(p.name), p]))
  const catalogById = new Map(catalog.map((p) => [p.id, p]))
  const items = new Map<string, HistoryItem>()
  /** history-only names that now exist in the catalog are tracked under the product id */
  const rekey = new Map<string, string>()

  const addItem = (key: string, name: string, productId: string | null): string => {
    let k = key, pid = productId
    if (!pid) {
      const p = catalogByName.get(normalizeName(name))
      if (p) { rekey.set(key, p.id); k = p.id; pid = p.id }
    }
    if (!items.has(k)) items.set(k, { key: k, name: (pid && catalogById.get(pid)?.name) || name, productId: pid })
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
      push(p.id, { key: rekey.get(key) ?? key, price, supplier: p.supplier, source: 'history' })
    }
  }
  for (const r of records) {
    if (!r.periodId || !isPeriodId(r.periodId) || !r.offers) continue
    for (const o of r.offers) {
      if (!(o.price > 0)) continue
      const key = addItem(o.key, o.name, o.productId)
      push(r.periodId, { key, price: o.price, supplier: r.supplierName, source: 'quote', quoteId: r.id, date: r.createdAt })
    }
  }

  const best: PriceHistory['best'] = {}
  for (const [period, per] of Object.entries(offers)) {
    best[period] = {}
    for (const [key, list] of Object.entries(per)) {
      // cheapest first; on equal price the earlier offer wins (history before quotes, then by date)
      list.sort((a, b) => a.price - b.price || (a.source === b.source ? (a.date ?? 0) - (b.date ?? 0) : a.source === 'history' ? -1 : 1))
      best[period]![key] = list[0]!
    }
  }

  // catalog order first, then history-only items
  const order = new Map(catalog.map((p, i) => [p.id, i]))
  const sortedItems = [...items.values()].sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9))
  return { periods: Object.keys(offers).sort(cmpPeriod), items: sortedItems, best, offers }
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

export function periodChanges(h: PriceHistory): PeriodChange[] {
  const out: PeriodChange[] = []
  h.periods.forEach((period, i) => {
    const cur = h.best[period] ?? {}
    const previous = i > 0 ? h.periods[i - 1]! : null
    const prev = previous ? h.best[previous] ?? {} : {}
    const common = Object.keys(cur).filter((k) => prev[k])
    let change: number | null = null
    if (previous && common.length) {
      const a = common.reduce((s, k) => s + cur[k]!.price, 0)
      const b = common.reduce((s, k) => s + prev[k]!.price, 0)
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
