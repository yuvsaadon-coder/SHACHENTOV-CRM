// Order planning (SPEC §10). Faithful TypeScript port of reference/algorithm.mjs, plus the period-length rule
// decided by the owner on 18.11.2026 (see HALF_YEAR_WEEKS / weeksInPeriodFor below and SPEC OQ-10).
//
// ORDER branches (14, e.g. "Savta Rivka") are not VOTING branches (7 + 3 in holidays).
// view 'weighted'  -> every branch gets the weighted/synchronised baskets  (one consolidated order)
// view 'by_branch' -> each branch gets exactly its own choice; branches that did not choose get the weighted
//                     basket and are only FLAGGED in branchStatus (never in the file).

import { aggregateBasket } from './results'
import type { BasketAggregate, CycleResults, CycleSnapshot, CycleType, PriceMap, Product, ProductId } from './types'

export type BasketCounts = { a: number; b: number; a_ext: number; b_ext: number }

/**
 * Owner decision (18.11.2026): a half-year order counts 24 weeks.
 * A branch that distributes weekly gets 24 distributions; every two weeks gets 12; every four weeks gets 6.
 */
export const HALF_YEAR_WEEKS = 24

export function isHoliday(cycleType: CycleType): boolean {
  return cycleType === 'pesach' || cycleType === 'rosh_hashana'
}

/** Weeks in the period for one order branch. Holidays are one distribution (weeks = frequency). */
export function weeksInPeriodFor(cycleType: CycleType, frequencyWeeks: number): number {
  return isHoliday(cycleType) ? frequencyWeeks : HALF_YEAR_WEEKS
}

export function distributionPlan({ weeksInPeriod, frequencyWeeks, avgBaskets }: {
  weeksInPeriod: number
  frequencyWeeks: number
  avgBaskets: number
}): { distributions: number; total: number; counts: BasketCounts } {
  if (!(frequencyWeeks > 0) || !(weeksInPeriod > 0) || !(avgBaskets > 0)) {
    return { distributions: 0, total: 0, counts: { a: 0, b: 0, a_ext: 0, b_ext: 0 } }
  }
  const distributions = Math.floor(weeksInPeriod / frequencyWeeks)
  const total = distributions * Math.floor(avgBaskets)
  const a = Math.ceil(total / 2), b = Math.floor(total / 2)
  return { distributions, total, counts: { a, b, a_ext: a, b_ext: b } }
}

/** distributionPlan() for a cycle type, applying the period rule above. */
export function branchDistributionPlan({ cycleType, frequencyWeeks, avgBaskets }: {
  cycleType: CycleType
  frequencyWeeks: number
  avgBaskets: number
}) {
  return distributionPlan({ weeksInPeriod: weeksInPeriodFor(cycleType, frequencyWeeks), frequencyWeeks, avgBaskets })
}

export interface BranchResult { baskets: Record<string, BasketAggregate> }

export function computeBranchBaskets({ cycle, results, options = {} }: {
  cycle: CycleSnapshot
  results: CycleResults
  options?: { allowPartialFit?: boolean }
}): Record<string, BranchResult> {
  const { products, coordinators, baskets } = cycle
  const coordById = new Map(coordinators.map((c) => [c.id, c]))
  const priceOf: PriceMap = new Map(products.map((p) => [p.id, p.price]))
  const out: Record<string, BranchResult> = {}
  const branches = [...new Set(Object.keys(results.aligned).map((cid) => coordById.get(cid)!.branchId))].sort()
  for (const br of branches) {
    const res: BranchResult = { baskets: {} }
    for (const b of baskets) {
      const voters = Object.keys(results.aligned)
        .filter((cid) => coordById.get(cid)!.branchId === br && results.aligned[cid]![b.id])
        .map((cid) => ({ id: cid, weight: coordById.get(cid)!.weight, branchId: br, items: results.aligned[cid]![b.id]! }))
      if (!voters.length) continue
      res.baskets[b.id] = aggregateBasket({ budget: b.budget, products, voters, priceOf, allowPartialFit: !!options.allowPartialFit })
    }
    if (Object.keys(res.baskets).length) out[br] = res
  }
  return out
}

export interface OrderBranch {
  id: string
  name?: string
  votingBranchId?: string
  counts?: Partial<Record<string, number>>
  suppliers?: string[]
  attrs?: Record<string, string | number>
  active?: boolean
}

export function unitPrice(product: Product, orderBranch: OrderBranch | null | undefined, cycleType: CycleType): number {
  let price = product.price
  if (product.holidayPrice != null && isHoliday(cycleType)) price = product.holidayPrice
  const v = product.priceVariants // e.g. eggs: { attr: 'eggPack', prices: { 12: 11.8, 18: 17.7 } }
  const attrVal = orderBranch?.attrs?.[v?.attr ?? '']
  if (v && attrVal != null && v.prices[String(attrVal)] != null) price = v.prices[String(attrVal)]!
  return price
}

export interface PlanRow {
  pid: ProductId
  name: string
  supplier: string
  showPriceInExcel: boolean
  perBranch: Record<string, { qty: number; unitPrice: number; cost: number }>
  qty: number
  cost: number
}

export interface BranchStatus {
  id: string
  source: 'own' | 'weighted'
  reason: 'voted' | 'no_voting_right' | 'did_not_vote'
}

export interface PlanOrderArgs {
  results: CycleResults
  branchResults?: Record<string, BranchResult>
  products: Product[]
  orderBranches: OrderBranch[]
  view?: 'weighted' | 'by_branch'
  scope?: string[] | null
  cycleType?: CycleType
  suppliers?: Record<string, { showPrices?: boolean }>
  votingBranchIds?: string[]
}

export interface PlanOrderResult {
  rows: PlanRow[]
  totals: { cost: number; byBranch: Record<string, number>; bySupplier: Record<string, number> }
  branchStatus: BranchStatus[]
}

export function planOrder({
  results, branchResults = {}, products, orderBranches, view = 'weighted', scope = null, cycleType = 'half_year_1',
  suppliers = {}, votingBranchIds = [],
}: PlanOrderArgs): PlanOrderResult {
  const supplierOf = (p: Product) => p.supplier || 'dry'
  const rows = new Map<ProductId, PlanRow>()
  const totals: PlanOrderResult['totals'] = { cost: 0, byBranch: {}, bySupplier: {} }
  const branchStatus: BranchStatus[] = []
  for (const b of orderBranches) {
    totals.byBranch[b.id] = 0
    const own = view === 'by_branch' && b.votingBranchId ? branchResults[b.votingBranchId] : undefined
    branchStatus.push({
      id: b.id,
      source: own ? 'own' : 'weighted',
      reason: own ? 'voted' : (!b.votingBranchId || !votingBranchIds.includes(b.votingBranchId) ? 'no_voting_right' : 'did_not_vote'),
    })
    for (const p of products) {
      const sup = supplierOf(p)
      if (scope && !scope.includes(sup)) continue
      if (b.suppliers && !b.suppliers.includes(sup)) continue // supplier does not deliver to this branch
      let q = 0
      for (const [key, n] of Object.entries(b.counts ?? {})) {
        const src = own?.baskets[key] ?? results.baskets[key] // missing own basket -> weighted basket
        q += (n ?? 0) * (src?.winners.find((w) => w.pid === p.id)?.qty ?? 0)
      }
      if (!q) continue
      const price = unitPrice(p, b, cycleType)
      const row = rows.get(p.id) ?? {
        pid: p.id, name: p.name, supplier: sup, showPriceInExcel: !!(suppliers[sup]?.showPrices ?? sup === 'dry'),
        perBranch: {}, qty: 0, cost: 0,
      }
      row.perBranch[b.id] = { qty: q, unitPrice: price, cost: q * price }
      row.qty += q; row.cost += q * price
      rows.set(p.id, row)
      totals.cost += q * price
      totals.byBranch[b.id] = (totals.byBranch[b.id] ?? 0) + q * price
      totals.bySupplier[sup] = (totals.bySupplier[sup] || 0) + q * price
    }
  }
  return { rows: [...rows.values()], totals, branchStatus }
}

/** Both totals side by side for the admin dashboard (SPEC §10.4) */
export function compareViews(args: PlanOrderArgs) {
  const weighted = planOrder({ ...args, view: 'weighted' })
  const byBranch = planOrder({ ...args, view: 'by_branch' })
  return { weighted, byBranch, diff: byBranch.totals.cost - weighted.totals.cost }
}
