// Types for the results algorithm (SPEC §7). Ported from reference/algorithm.mjs.

export type ProductId = string
export type CoordinatorId = string
export type BasketId = string
export type GroupId = string
export type Slot = 'A' | 'B'

/** productId -> quantity */
export type Items = Record<ProductId, number>
export type PriceMap = Map<ProductId, number>

export type CycleType = 'half_year_1' | 'half_year_2' | 'pesach' | 'rosh_hashana'

export interface PriceVariants {
  attr: string
  prices: Record<string, number>
}

export interface Product {
  id: ProductId
  name: string
  price: number
  max: number
  cat: string
  emoji?: string
  excludedBranches?: string[]
  supplier?: string
  holidayPrice?: number | null
  priceVariants?: PriceVariants
  active?: boolean
  sortOrder?: number
}

export interface Coordinator {
  id: CoordinatorId
  name?: string
  branchId: string
  weight: number
  active?: boolean
}

export interface Basket {
  id: BasketId
  name?: string
  budget: number
  group: GroupId
  slot: Slot
}

export interface CycleSnapshot {
  products: Product[]
  coordinators: Coordinator[]
  baskets: Basket[]
}

export interface Vote {
  baskets?: Record<BasketId, Items>
  submittedAt?: number
}

export type Override = 'keep' | 'swap'

export interface AlignVoter {
  id: CoordinatorId
  weight: number
  submittedAt: number
  a: Items
  b: Items
}

export interface AlignInfo {
  swapped: boolean
  auto: boolean
  overridden: boolean
  isAnchor: boolean
  sameScore: number
  swapScore: number
  uncertain: boolean
}

export interface AggVoter {
  id: CoordinatorId
  weight: number
  branchId: string
  items: Items
}

export interface ProductStat {
  pid: ProductId
  name: string
  emoji?: string
  cat: string
  price: number
  max: number
  support: number
  pickRate: number
  qty: number
  pickedByCount: number
  pickedByWeight: number
  eligibleWeight: number
}

export interface Winner extends ProductStat {
  cost: number
  reduced: boolean
}

export interface Tie {
  support: number
  pids: ProductId[]
  selected: ProductId[]
  rejected: ProductId[]
  resolvedByAdmin: boolean
}

export interface BasketAggregate {
  budget: number
  used: number
  leftover: number
  winners: Winner[]
  notSelected: ProductStat[]
  ties: Tie[]
  voterCount: number
  voterWeight: number
}

export type Issue =
  | { type: 'unknown_coordinator'; coordinatorId: CoordinatorId }
  | { type: 'unknown_product'; coordinatorId: CoordinatorId; basketId: BasketId; pid: ProductId }
  | { type: 'ineligible_product'; coordinatorId: CoordinatorId; basketId: BasketId; pid: ProductId }
  | { type: 'over_max'; coordinatorId: CoordinatorId; basketId: BasketId; pid: ProductId; qty: number; max: number }
  | { type: 'over_budget'; coordinatorId: CoordinatorId; basketId: BasketId; cost: number; budget: number }

export interface BasketResult extends BasketAggregate {
  basketId: BasketId
  name?: string
  group: GroupId
  slot: Slot
}

export interface PooledResult extends BasketAggregate {
  group: GroupId
}

export interface CycleResults {
  baskets: Record<BasketId, BasketResult>
  pooled: Record<GroupId, PooledResult>
  alignment: Record<GroupId, Record<CoordinatorId, AlignInfo>>
  issues: Issue[]
  aligned: Record<CoordinatorId, Record<BasketId, Items>>
  coverage: { voters: number; totalVoters: number; weight: number; totalWeight: number }
}

export interface ComputeOptions {
  align?: boolean
  alignMargin?: number
  allowPartialFit?: boolean
}
