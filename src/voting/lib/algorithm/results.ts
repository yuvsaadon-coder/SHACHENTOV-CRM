// Results algorithm (SPEC §7). Faithful TypeScript port of reference/algorithm.mjs.
// Pure: no I/O, no DOM, no Firebase, no Date.now(). Do not change semantics without the owner's approval.

import type {
  AggVoter, AlignInfo, AlignVoter, Basket, BasketAggregate, BasketId, BasketResult, ComputeOptions,
  CoordinatorId, CycleResults, CycleSnapshot, Issue, Items, Override, PooledResult, PriceMap, Product,
  ProductId, ProductStat, Tie, Vote, Winner,
} from './types'

export const EPS = 1e-9
export const DEFAULT_ALIGN_MARGIN = 0.1

const byId = <T extends { id: string }>(arr: T[]): Map<string, T> => new Map(arr.map((x) => [x.id, x]))
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function eligible(product: Pick<Product, 'excludedBranches'>, coordinator: { branchId: string }): boolean {
  return !(product.excludedBranches ?? []).includes(coordinator.branchId)
}

export function basketCost(items: Items | undefined, priceOf: PriceMap): number {
  let s = 0
  for (const [pid, q] of Object.entries(items ?? {})) s += (priceOf.get(pid) || 0) * q
  return s
}

/** Cost-weighted overlap in [0,1]. 1 = identical baskets, 0 = nothing in common. Both empty => 1. */
export function overlap(x: Items | undefined, y: Items | undefined, priceOf: PriceMap): number {
  const m = Math.max(basketCost(x, priceOf), basketCost(y, priceOf))
  if (m < EPS) return 1
  const xx = x ?? {}
  const yy = y ?? {}
  let common = 0
  for (const pid of new Set([...Object.keys(xx), ...Object.keys(yy)])) {
    common += Math.min(xx[pid] || 0, yy[pid] || 0) * (priceOf.get(pid) || 0)
  }
  return common / m
}

function centroid(voters: AlignVoter[], orient: Map<string, boolean>, slotKey: 'A' | 'B', excludeId: string): Items {
  const sum: Items = {}
  let w = 0
  for (const u of voters) {
    if (u.id === excludeId) continue
    const swapped = orient.get(u.id)
    const items = swapped ? (slotKey === 'A' ? u.b : u.a) : (slotKey === 'A' ? u.a : u.b)
    w += u.weight
    for (const [pid, q] of Object.entries(items ?? {})) sum[pid] = (sum[pid] || 0) + u.weight * q
  }
  if (w < EPS) return {}
  for (const pid of Object.keys(sum)) sum[pid] = (sum[pid] ?? 0) / w
  return sum
}

export interface AlignGroupArgs {
  voters: AlignVoter[]
  priceOf: PriceMap
  overrides?: Record<CoordinatorId, Override>
  margin?: number
  maxIter?: number
}

/** Decide, for each voter, whether their (A,B) baskets were filled in swapped order relative to the crowd. */
export function alignGroup({
  voters, priceOf, overrides = {}, margin = DEFAULT_ALIGN_MARGIN, maxIter = 10,
}: AlignGroupArgs): Map<CoordinatorId, AlignInfo> {
  const info = new Map<CoordinatorId, AlignInfo>()
  if (voters.length === 0) return info
  const sorted = [...voters].sort(
    (p, q) => q.weight - p.weight || p.submittedAt - q.submittedAt || cmpStr(p.id, q.id),
  )
  const anchorId = sorted[0]!.id // the anchor's orientation defines the labels; never auto-flipped
  const orient = new Map(voters.map((v) => [v.id, overrides[v.id] === 'swap']))
  const fixed = new Set(voters.filter((v) => overrides[v.id] === 'keep' || overrides[v.id] === 'swap').map((v) => v.id))
  fixed.add(anchorId)

  const scoreOf = (v: AlignVoter) => {
    const refA = centroid(voters, orient, 'A', v.id)
    const refB = centroid(voters, orient, 'B', v.id)
    return {
      same: overlap(v.a, refA, priceOf) + overlap(v.b, refB, priceOf),
      swp: overlap(v.a, refB, priceOf) + overlap(v.b, refA, priceOf),
    }
  }

  if (voters.length > 1) {
    for (let it = 0; it < maxIter; it++) {
      let changed = false
      for (const v of sorted) {
        if (fixed.has(v.id)) continue
        const { same, swp } = scoreOf(v)
        const cur = orient.get(v.id) ?? false
        // hysteresis: switch only when the other orientation wins by more than `margin`
        const next = cur ? !(same - swp > margin) : swp - same > margin
        if (next !== cur) { orient.set(v.id, next); changed = true }
      }
      if (!changed) break
    }
  }
  for (const v of voters) {
    const { same, swp } = voters.length > 1 ? scoreOf(v) : { same: 2, swp: 0 }
    const swapped = orient.get(v.id) ?? false
    info.set(v.id, {
      swapped,
      auto: swapped && !(overrides[v.id] === 'swap'),
      overridden: overrides[v.id] === 'keep' || overrides[v.id] === 'swap',
      isAnchor: v.id === anchorId,
      sameScore: same,
      swapScore: swp,
      // uncertain = the two orientations are within `margin` of each other (admin may want to look)
      uncertain: Math.abs(same - swp) <= margin && !fixed.has(v.id),
    })
  }
  return info
}

export interface AggregateArgs {
  budget: number
  products: Product[]
  voters: AggVoter[]
  allowPartialFit?: boolean
  tieBreaks?: ProductId[]
  priceOf: PriceMap
}

/** Aggregate one (aligned) basket across voters and fill the budget greedily. */
export function aggregateBasket({
  budget, products, voters, allowPartialFit = false, tieBreaks = [], priceOf: _priceOf,
}: AggregateArgs): BasketAggregate {
  void _priceOf // kept for signature parity with the reference implementation
  const stats: ProductStat[] = []
  for (const p of products) {
    let eligW = 0, wq = 0, pickW = 0, pickN = 0
    for (const v of voters) {
      if (!eligible(p, v)) continue
      eligW += v.weight
      const q = Math.min(Math.max(0, (v.items ?? {})[p.id] || 0), p.max)
      if (q > 0) { wq += v.weight * q; pickW += v.weight; pickN += 1 }
    }
    if (eligW < EPS || pickW < EPS) continue
    stats.push({
      pid: p.id, name: p.name, emoji: p.emoji, cat: p.cat, price: p.price, max: p.max,
      support: wq / eligW, // weighted average quantity per eligible voter-weight
      pickRate: pickW / eligW, // share of eligible weight that chose the product
      qty: Math.min(p.max, Math.max(1, Math.round(wq / pickW))),
      pickedByCount: pickN, pickedByWeight: pickW, eligibleWeight: eligW,
    })
  }
  const tbIndex = new Map(tieBreaks.map((pid, i) => [pid, i]))
  stats.sort((x, y) => {
    if (Math.abs(x.support - y.support) > EPS) return y.support - x.support
    const ix = tbIndex.get(x.pid) ?? Infinity
    const iy = tbIndex.get(y.pid) ?? Infinity
    if (ix !== iy) return ix - iy
    if (Math.abs(x.pickRate - y.pickRate) > EPS) return y.pickRate - x.pickRate
    if (Math.abs(x.price - y.price) > EPS) return x.price - y.price
    return cmpStr(x.pid, y.pid)
  })

  const winners: Winner[] = []
  let used = 0
  for (const s of stats) {
    let q = s.qty
    if (used + q * s.price > budget + EPS && allowPartialFit) {
      while (q > 1 && used + q * s.price > budget + EPS) q -= 1
    }
    const cost = q * s.price
    if (used + cost <= budget + EPS) {
      winners.push({ ...s, qty: q, cost, reduced: q !== s.qty })
      used += cost
    }
  }
  const won = new Set(winners.map((w) => w.pid))

  // Decisive ties: equal support, and the group straddles the cut (some selected, some not).
  const ties: Tie[] = []
  let i = 0
  while (i < stats.length) {
    let j = i + 1
    while (j < stats.length && Math.abs(stats[j]!.support - stats[i]!.support) <= EPS) j++
    const grp = stats.slice(i, j)
    const sel = grp.filter((g) => won.has(g.pid)).map((g) => g.pid)
    const rej = grp.filter((g) => !won.has(g.pid)).map((g) => g.pid)
    if (grp.length > 1 && sel.length > 0 && rej.length > 0) {
      ties.push({
        support: grp[0]!.support, pids: grp.map((g) => g.pid), selected: sel, rejected: rej,
        resolvedByAdmin: grp.every((g) => tbIndex.has(g.pid)),
      })
    }
    i = j
  }
  return {
    budget, used, leftover: budget - used,
    winners, notSelected: stats.filter((s) => !won.has(s.pid)), ties,
    voterCount: voters.length, voterWeight: voters.reduce((a, v) => a + v.weight, 0),
  }
}

export interface ComputeArgs {
  cycle: CycleSnapshot
  votes: Record<CoordinatorId, Vote>
  overrides?: Record<string, Record<CoordinatorId, Override>>
  tieBreaks?: Record<string, ProductId[]>
  options?: ComputeOptions
}

export function computeCycleResults({
  cycle, votes, overrides = {}, tieBreaks = {}, options = {},
}: ComputeArgs): CycleResults {
  const { products, coordinators, baskets } = cycle
  const priceOf: PriceMap = new Map(products.map((p) => [p.id, p.price]))
  const prodById = byId(products)
  const coordById = byId(coordinators)
  const issues: Issue[] = []

  // 1. sanitize votes against the cycle snapshot (never trust client-side validation)
  const clean: Record<CoordinatorId, Record<BasketId, Items>> = {}
  for (const [cid, vote] of Object.entries(votes)) {
    const c = coordById.get(cid)
    if (!c) { issues.push({ type: 'unknown_coordinator', coordinatorId: cid }); continue }
    const cleanC: Record<BasketId, Items> = {}
    clean[cid] = cleanC
    for (const b of baskets) {
      const raw = (vote.baskets ?? {})[b.id] ?? {}
      const items: Items = {}
      for (const [pid, q] of Object.entries(raw)) {
        const p = prodById.get(pid)
        if (!p) { issues.push({ type: 'unknown_product', coordinatorId: cid, basketId: b.id, pid }); continue }
        if (!eligible(p, c)) { issues.push({ type: 'ineligible_product', coordinatorId: cid, basketId: b.id, pid }); continue }
        if (!(q > 0)) continue
        if (q > p.max) issues.push({ type: 'over_max', coordinatorId: cid, basketId: b.id, pid, qty: q, max: p.max })
        items[pid] = Math.min(q, p.max)
      }
      const cost = basketCost(items, priceOf)
      if (cost > b.budget + EPS) {
        issues.push({ type: 'over_budget', coordinatorId: cid, basketId: b.id, cost, budget: b.budget })
        continue // this basket of this voter is excluded; the voter's other baskets still count
      }
      if (cost > EPS) cleanC[b.id] = items
    }
  }
  const weightOf = (cid: string): number => coordById.get(cid)!.weight
  const branchOf = (cid: string): string => coordById.get(cid)!.branchId

  // 2. alignment per group
  const groups = [...new Set(baskets.map((b) => b.group))]
  const alignment: CycleResults['alignment'] = {}
  const aligned: CycleResults['aligned'] = {}
  for (const cid of Object.keys(clean)) aligned[cid] = { ...clean[cid] }
  for (const g of groups) {
    const bA = baskets.find((b) => b.group === g && b.slot === 'A')
    const bB = baskets.find((b) => b.group === g && b.slot === 'B')
    if (!bA || !bB) continue
    const voters: AlignVoter[] = Object.keys(clean)
      .filter((cid) => clean[cid]![bA.id] && clean[cid]![bB.id])
      .map((cid) => ({
        id: cid, weight: weightOf(cid), submittedAt: votes[cid]!.submittedAt || 0,
        a: clean[cid]![bA.id]!, b: clean[cid]![bB.id]!,
      }))
    const info = alignGroup({
      voters, priceOf, overrides: overrides[g] ?? {}, margin: options.alignMargin ?? DEFAULT_ALIGN_MARGIN,
    })
    alignment[g] = Object.fromEntries(info)
    if (options.align !== false) {
      for (const [cid, inf] of info) {
        if (inf.swapped) {
          aligned[cid]![bA.id] = clean[cid]![bB.id]!
          aligned[cid]![bB.id] = clean[cid]![bA.id]!
        }
      }
    }
  }

  // 3. per-basket aggregation (two-baskets view)
  const result: Record<BasketId, BasketResult> = {}
  for (const b of baskets) {
    const voters: AggVoter[] = Object.keys(aligned)
      .filter((cid) => aligned[cid]![b.id])
      .map((cid) => ({ id: cid, weight: weightOf(cid), branchId: branchOf(cid), items: aligned[cid]![b.id]! }))
    result[b.id] = {
      basketId: b.id, name: b.name, group: b.group, slot: b.slot,
      ...aggregateBasket({
        budget: b.budget, products, voters, priceOf,
        allowPartialFit: !!options.allowPartialFit, tieBreaks: tieBreaks[b.id] ?? [],
      }),
    }
  }

  // 4. pooled view (single consensus basket per group). Invariant to A/B order by construction.
  const pooled: Record<string, PooledResult> = {}
  for (const g of groups) {
    const gb: Basket[] = baskets.filter((b) => b.group === g)
    const voters: AggVoter[] = []
    for (const cid of Object.keys(clean)) {
      const parts = gb.map((b) => clean[cid]![b.id]).filter((x): x is Items => !!x)
      if (!parts.length) continue
      const items: Items = {}
      for (const part of parts) for (const [pid, q] of Object.entries(part)) items[pid] = (items[pid] || 0) + q / parts.length
      voters.push({ id: cid, weight: weightOf(cid), branchId: branchOf(cid), items })
    }
    const budget = gb.reduce((a, b) => a + b.budget, 0) / gb.length
    pooled[g] = {
      group: g,
      ...aggregateBasket({
        budget, products, voters, priceOf, allowPartialFit: !!options.allowPartialFit, tieBreaks: tieBreaks[g] ?? [],
      }),
    }
  }

  const submitted = Object.keys(clean)
  return {
    baskets: result, pooled, alignment, issues, aligned,
    coverage: {
      voters: submitted.length, totalVoters: coordinators.length,
      weight: submitted.reduce((a, cid) => a + weightOf(cid), 0),
      totalWeight: coordinators.reduce((a, c) => a + c.weight, 0),
    },
  }
}

export interface OrderLine {
  pid: ProductId
  name: string
  cat: string
  unitPrice: number
  qtyPerBasket: Record<string, number>
  qty: number
  cost: number
}

/** Turns results into purchase lines. multipliers = number of physical baskets of each type to produce. */
export function buildOrderLines({
  results, multipliers, products, view = 'two_baskets',
}: {
  results: CycleResults
  multipliers: Record<string, number>
  products: Product[]
  view?: 'two_baskets' | 'pooled'
}): OrderLine[] {
  const prodById = byId(products)
  const lines = new Map<ProductId, OrderLine>()
  const source: Record<string, BasketAggregate> = view === 'pooled' ? results.pooled : results.baskets
  for (const [key, r] of Object.entries(source)) {
    const mult = multipliers[key] ?? 0
    for (const w of r.winners) {
      const p = prodById.get(w.pid)!
      const l = lines.get(w.pid) ?? { pid: w.pid, name: p.name, cat: p.cat, unitPrice: p.price, qtyPerBasket: {}, qty: 0, cost: 0 }
      l.qtyPerBasket[key] = w.qty
      l.qty += w.qty * mult
      l.cost += w.qty * mult * p.price
      lines.set(w.pid, l)
    }
  }
  return [...lines.values()].sort((a, b) => (a.cat === b.cat ? b.cost - a.cost : a.cat === 'dry' ? -1 : 1))
}
