// Turn CRM data into the algorithm's cycle input. Pure.
import type { CycleSnapshot, Vote } from '../lib/algorithm'
import type { BranchSettings, VoteDoc, VotingConfig } from './model'
import { BASKET_KEYS, voteId } from './model'
import { branchWeights, participates, voterWeights, type OrderKind } from './weights'

export const orderKindOf = (cfg: Pick<VotingConfig, 'round'>): OrderKind =>
  cfg.round?.orderType === 'pesach' || cfg.round?.orderType === 'rosh_hashana' ? 'holiday' : 'routine'

const GROUP_SLOT = {
  a: { group: 'main', slot: 'A' }, b: { group: 'main', slot: 'B' }, a_ext: { group: 'ext', slot: 'A' }, b_ext: { group: 'ext', slot: 'B' },
} as const

export interface Coordinator { uid: string; name: string; branchIds: string[] }

/** Coordinators expected to vote this round: one entry per (coordinator, participating branch). */
export function expectedVoters(coords: Coordinator[], settings: Record<string, BranchSettings>, kind: OrderKind) {
  return coords.flatMap((c) => c.branchIds.filter((b) => participates(settings[b], kind)).map((branchId) => ({ id: voteId(c.uid, branchId), uid: c.uid, name: c.name, branchId })))
}

export function buildCycle(cfg: VotingConfig, votes: VoteDoc[], settings: Record<string, BranchSettings>): {
  snapshot: CycleSnapshot
  votes: Record<string, Vote>
  branchWeights: Record<string, number>
} {
  const kind = orderKindOf(cfg)
  const bw = branchWeights(settings, kind)
  const valid = votes.filter((v) => bw[v.branchId] != null)
  const vw = voterWeights(valid.map((v) => ({ id: voteId(v.uid, v.branchId), branchId: v.branchId })), bw)
  return {
    snapshot: {
      products: cfg.products.filter((p) => p.active !== false).map((p) => ({
        id: p.id, name: p.name, price: Number(p.price) || 0, max: Number(p.max) || 0, cat: p.cat, emoji: p.emoji,
        excludedBranches: p.excludedBranches ?? [],
      })),
      coordinators: valid.map((v) => ({ id: voteId(v.uid, v.branchId), name: v.name, branchId: v.branchId, weight: vw[voteId(v.uid, v.branchId)]! })),
      baskets: cfg.baskets.filter((b) => b.id in GROUP_SLOT).map((b) => ({ id: b.id, name: b.name, budget: b.budget, ...GROUP_SLOT[b.id as keyof typeof GROUP_SLOT] })),
    },
    votes: Object.fromEntries(valid.map((v) => [voteId(v.uid, v.branchId), {
      submittedAt: v.submittedAt || 0,
      baskets: Object.fromEntries(BASKET_KEYS.filter((k) => v.baskets[k]).map((k) => [k, v.baskets[k]!])),
    }])),
    branchWeights: bw,
  }
}

/** Products a coordinator of a branch sees in the survey. */
export function productsForBranch(cfg: VotingConfig, branchId: string) {
  return cfg.products.filter((p) => p.active !== false && !(p.excludedBranches ?? []).includes(branchId))
}
