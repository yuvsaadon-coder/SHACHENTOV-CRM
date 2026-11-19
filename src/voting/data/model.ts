// Voting module data model inside the CRM (Firebase project shachentov-crm, collections prefixed voting_).
// Coordinators are NOT stored here: they are the CRM's own users (role coordinator) and their portal branches.
import type { CycleType, Items } from '../lib/algorithm'

export interface VotingProduct {
  id: string
  name: string
  price: number
  max: number
  cat: string
  emoji: string
  /** CRM branch ids that do not see this product */
  excludedBranches?: string[]
  /** supply category: dry, eggs, poultry, vegetables, bermann */
  supplier?: string
  /** false = hidden from the survey (e.g. not in the chosen supplier's quote) */
  active?: boolean
  sortOrder?: number
  [k: string]: unknown
}
/** Name kept for the modules ported from the standalone app. */
export type LegacyProduct = VotingProduct

export interface VotingBasket { id: string; name: string; budget: number }

export interface RoundState {
  num: number
  open: boolean
  openedAt?: number
  orderType?: CycleType
  year?: number
  periodId?: string
}

/** voting_config/main — each field is written on its own (never the whole document). */
export interface VotingConfig {
  products: VotingProduct[]
  baskets: VotingBasket[]
  round?: RoundState
}

export type BasketKey = 'a' | 'a_ext' | 'b' | 'b_ext'
export const BASKET_KEYS: BasketKey[] = ['a', 'a_ext', 'b', 'b_ext']

/** voting_votes/{uid}_{branchId}: one vote per coordinator per branch. */
export interface VoteDoc {
  uid: string
  branchId: string
  /** display name at the time of voting */
  name: string
  submittedAt: number
  baskets: Partial<Record<BasketKey, Items>>
  round?: number
}
export const voteId = (uid: string, branchId: string) => `${uid}_${branchId}`

export type VotesIn = 'always' | 'holidays' | 'never'
/** voting_branches/{crmBranchId}: who votes, and family counts that set the branch weight. */
export interface BranchSettings {
  votesIn: VotesIn
  /** families / baskets per distribution in a routine (half-year) order */
  familiesRoutine: number | null
  /** families in a holiday order */
  familiesHoliday: number | null
}
