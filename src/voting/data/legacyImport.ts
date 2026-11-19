// One-time import from the standalone voting app (Firebase project shachentov-1316f) into the CRM. Pure mapping.
//
// What moves: catalog (products, baskets), the round number/type (closed, so the next round continues the
// numbering), saved quotes, supplier decisions and discounts, round history, and votes (the old open round's votes
// and the archived ones) as ARCHIVED votes — they feed the budget recommendation; live voting starts fresh in the CRM
// (cut-over happens between rounds). Old coordinators are matched to CRM coordinators by name and branch; the old
// branch names are matched to CRM branches.
import seedJson from '../seed/seed.json'
import { normalizeName } from '../lib/quotes/match'
import type { Items } from '../lib/algorithm'
import { sameBranch } from './defaults'
import type { BasketKey, RoundState, VoteDoc, VotingBasket, VotingProduct } from './model'
import { BASKET_KEYS } from './model'
import type { Coordinator } from './cycle'

const seed = seedJson as unknown as { branches: { id: string; name: string }[] }
const seedName = new Map(seed.branches.map((b) => [b.id, b.name]))
const NON_VOTING = /רב שמעון|שלומי|סבתא/

export interface LegacyVoteDoc {
  coordinatorId?: string
  coordinatorName?: string
  branch?: string
  submittedAt?: number
  round?: number
  a?: Items; a_ext?: Items; b?: Items; b_ext?: Items
}
export interface LegacyConfigDoc {
  products?: (VotingProduct & { excludedBranches?: string[] })[]
  baskets?: VotingBasket[]
  round?: RoundState
  freshExcluded?: string[]
}

/** CRM branch for an old branch name or seed slug (never a non-voting order branch). */
export function crmBranchFor(nameOrSlug: string, crmBranches: { id: string; name: string }[]): string | null {
  const name = seedName.get(nameOrSlug) ?? nameOrSlug
  const exact = crmBranches.find((c) => normalizeName(c.name) === normalizeName(name))
  if (exact) return exact.id
  return crmBranches.find((c) => sameBranch(c.name, name) && !NON_VOTING.test(c.name))?.id ?? null
}

/** Old products: exclusions were seed slugs (or, in the oldest configs, "veg hidden from Baka and Katamon"). */
export function mapProducts(cfg: LegacyConfigDoc, crmBranches: { id: string; name: string }[]): VotingProduct[] {
  const fresh = cfg.freshExcluded ?? ['בקעה', 'קטמון']
  return (cfg.products ?? []).map((p) => {
    const raw = Array.isArray(p.excludedBranches) ? p.excludedBranches : p.id === 'veg' ? fresh : []
    const excludedBranches = [...new Set(raw.map((x) => crmBranchFor(x, crmBranches)).filter((x): x is string => !!x))]
    return { ...p, excludedBranches }
  })
}

export interface MappedVotes {
  votes: (VoteDoc & { round: number })[]
  /** old coordinator names that matched no CRM coordinator (their votes are still kept, under a legacy id) */
  unmatched: string[]
  /** votes whose branch matched no CRM branch (dropped) */
  noBranch: string[]
}

export function mapVotes(old: LegacyVoteDoc[], defaultRound: number, coords: Coordinator[], crmBranches: { id: string; name: string }[]): MappedVotes {
  const unmatched = new Set<string>(), noBranch = new Set<string>()
  const votes: MappedVotes['votes'] = []
  for (const v of old) {
    const name = (v.coordinatorName ?? '').trim()
    const branchId = v.branch ? crmBranchFor(v.branch, crmBranches) : null
    if (!branchId) { noBranch.add(`${name} (${v.branch ?? '?'})`); continue }
    const byName = coords.filter((c) => normalizeName(c.name) === normalizeName(name))
    const match = byName.find((c) => c.branchIds.includes(branchId)) ?? (byName.length === 1 ? byName[0] : undefined)
    if (!match) unmatched.add(name || v.coordinatorId || '?')
    const baskets: Partial<Record<BasketKey, Items>> = {}
    for (const k of BASKET_KEYS) if (v[k]) baskets[k] = v[k]
    votes.push({
      uid: match?.uid ?? `legacy-${v.coordinatorId ?? normalizeName(name)}`, branchId, name, submittedAt: v.submittedAt ?? 0,
      baskets, round: v.round ?? defaultRound,
    })
  }
  return { votes, unmatched: [...unmatched], noBranch: [...noBranch] }
}
