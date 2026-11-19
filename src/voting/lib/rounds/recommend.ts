// New-round setup (owner 19.11.2026): order type + basket budgets, with a budget recommendation based on the
// previous survey. Pure: no Firebase, no DOM, no clock.
//
// Recommendation per basket = previous budget x price change of the basket coordinators actually voted for:
//   "the voted basket" = weighted sum over coordinators of the quantities they put in that basket,
//   priced at survey-time prices (the round's price snapshot) and at today's catalog prices.
// When the previous round has no price snapshot (rounds opened before this feature), the price change comes
// from the price-tracking index instead. Fill rate (how much of the budget coordinators used) is shown as context.
import type { CycleType, Items } from '../algorithm'

export type OrderType = CycleType
export const ORDER_TYPES: OrderType[] = ['half_year_1', 'half_year_2', 'pesach', 'rosh_hashana']
export const isHolidayOrder = (t: OrderType | undefined) => t === 'pesach' || t === 'rosh_hashana'

/** Price-tracking period of an order (holidays use the half-year they fall in: Pesach = H1, Rosh Hashana = H2). */
export function orderPeriod(type: OrderType, year: number): string {
  return `${year}-H${type === 'half_year_1' || type === 'pesach' ? 1 : 2}`
}

export interface RoundMeta {
  num: number
  orderType?: OrderType
  year?: number
  periodId?: string
  budgets?: Record<string, number>
  /** catalog prices when the round was opened */
  priceSnapshot?: Record<string, number>
  openedAt?: number
  closedAt?: number
}

export interface PastVote { weight: number; baskets: Record<string, Items> }

export interface BasketRecommendation {
  basketId: string
  previousBudget: number
  /** weighted share of the budget coordinators used (0..1+), null if nobody filled the basket */
  fillRate: number | null
  /** relative price change of the voted basket (0.04 = +4%), null if unknown */
  priceChange: number | null
  priceSource: 'snapshot' | 'tracker' | 'none'
  recommended: number
}

const cost = (items: Items, prices: Record<string, number>) => Object.entries(items).reduce((s, [pid, q]) => s + (prices[pid] ?? 0) * q, 0)

export function recommendBudgets(args: {
  baskets: { id: string; budget: number }[]
  votes: PastVote[]
  /** prices the previous survey was answered with (its snapshot); null if unknown */
  surveyPrices: Record<string, number> | null
  currentPrices: Record<string, number>
  /** fallback price change from the price tracker, e.g. 0.02 */
  trackerChange: number | null
}): BasketRecommendation[] {
  return args.baskets.map((b) => {
    const priced = args.surveyPrices ?? args.currentPrices
    let w = 0, fill = 0
    const voted: Items = {}
    for (const v of args.votes) {
      const items = v.baskets[b.id]
      if (!items || !Object.values(items).some((q) => q > 0)) continue
      w += v.weight
      fill += v.weight * (b.budget > 0 ? cost(items, priced) / b.budget : 0)
      for (const [pid, q] of Object.entries(items)) voted[pid] = (voted[pid] ?? 0) + v.weight * q
    }
    let priceChange: number | null = null
    let priceSource: BasketRecommendation['priceSource'] = 'none'
    if (args.surveyPrices && w > 0) {
      // only products priced at both times; a product that disappeared cannot say anything about inflation
      const common = Object.keys(voted).filter((pid) => args.surveyPrices![pid] != null && args.currentPrices[pid] != null)
      const before = common.reduce((s, pid) => s + voted[pid]! * args.surveyPrices![pid]!, 0)
      const after = common.reduce((s, pid) => s + voted[pid]! * args.currentPrices[pid]!, 0)
      if (before > 0) { priceChange = after / before - 1; priceSource = 'snapshot' }
    }
    if (priceChange == null && args.trackerChange != null) { priceChange = args.trackerChange; priceSource = 'tracker' }
    const recommended = Math.max(1, Math.ceil(b.budget * (1 + (priceChange ?? 0)) - 1e-9))
    return { basketId: b.id, previousBudget: b.budget, fillRate: w > 0 ? fill / w : null, priceChange, priceSource, recommended }
  })
}
