// Phase 0 data shapes: identical to what the legacy site reads/writes in Firestore (config/main + votes/{coordId}),
// so the new site and the legacy site can run side by side on the same database until cut-over (CLAUDE.md workflow #3).
// Phase 2 replaces this with the cycle model (SPEC §8).
import seedJson from '../../seed/seed.json'
import type { Basket, CycleSnapshot, Items, Product, Vote } from '../lib/algorithm'

export interface LegacyProduct {
  id: string
  name: string
  price: number
  max: number
  cat: string
  emoji: string
  excludedBranches?: string[]
  [k: string]: unknown
}
export interface LegacyCoordinator { id: string; name: string; branch: string; weight: number }
export interface LegacyBasket { id: string; name: string; budget: number; desc?: string }
export interface RoundState { num: number; open: boolean; openedAt?: number }

export interface LegacyConfig {
  products: LegacyProduct[]
  coordinators: LegacyCoordinator[]
  baskets: LegacyBasket[]
  freshExcluded?: string[]
  round?: RoundState
}

export type BasketKey = 'a' | 'a_ext' | 'b' | 'b_ext'
export const BASKET_KEYS: BasketKey[] = ['a', 'a_ext', 'b', 'b_ext']

export interface LegacyVote {
  coordinatorId: string
  coordinatorName: string
  branch: string
  submittedAt: number
  a?: Items
  a_ext?: Items
  b?: Items
  b_ext?: Items
}

interface SeedShape {
  branches: { id: string; name: string }[]
  products: LegacyProduct[]
  coordinators: { id: string; name: string; branchId: string; weight: number; active?: boolean }[]
  basketTemplate: { id: string; name: string; budget: number }[]
}
const seed = seedJson as unknown as SeedShape

/** Branches that do not see "ירקות" in the legacy site (data.js freshExcluded). */
export const LEGACY_FRESH_EXCLUDED = ['בקעה', 'קטמון']
export const DEFAULT_ROUND: RoundState = { num: 14, open: true }

/** Same role as legacy data.js: used when config/main does not exist yet. */
export function defaultConfig(): LegacyConfig {
  const branchName = new Map(seed.branches.map((b) => [b.id, b.name]))
  return {
    products: seed.products.map((p) => ({ ...p })),
    coordinators: seed.coordinators
      .filter((c) => c.active !== false)
      .map((c) => ({ id: c.id, name: c.name, branch: branchName.get(c.branchId) ?? c.branchId, weight: c.weight })),
    baskets: seed.basketTemplate.map((b) => ({ id: b.id, name: b.name, budget: b.budget })),
  }
}

const branchIdByName = new Map(seed.branches.map((b) => [b.name, b.id]))
export const branchIdOf = (name: string): string => branchIdByName.get(name) ?? name

const GROUP_SLOT: Record<string, Pick<Basket, 'group' | 'slot'>> = {
  a: { group: 'main', slot: 'A' },
  b: { group: 'main', slot: 'B' },
  a_ext: { group: 'ext', slot: 'A' },
  b_ext: { group: 'ext', slot: 'B' },
}

/** Product as the algorithm sees it. Legacy configs have no excludedBranches; veg follows freshExcluded. */
export function toAlgoProduct(p: LegacyProduct, freshExcluded: string[]): Product {
  const excludedBranches = Array.isArray(p.excludedBranches)
    ? p.excludedBranches
    : p.id === 'veg' ? freshExcluded.map(branchIdOf) : []
  return {
    id: p.id, name: p.name, price: Number(p.price) || 0, max: Number(p.max) || 0, cat: p.cat, emoji: p.emoji,
    excludedBranches,
  }
}

export function toCycleSnapshot(cfg: LegacyConfig): CycleSnapshot {
  const fresh = cfg.freshExcluded ?? LEGACY_FRESH_EXCLUDED
  return {
    products: cfg.products.map((p) => toAlgoProduct(p, fresh)),
    coordinators: cfg.coordinators.map((c) => ({ id: c.id, name: c.name, branchId: branchIdOf(c.branch), weight: c.weight })),
    baskets: cfg.baskets
      .filter((b) => GROUP_SLOT[b.id])
      .map((b) => ({ id: b.id, name: b.name, budget: b.budget, ...GROUP_SLOT[b.id]! })),
  }
}

export function toAlgoVotes(votes: Record<string, LegacyVote>): Record<string, Vote> {
  const out: Record<string, Vote> = {}
  for (const [id, v] of Object.entries(votes)) {
    const baskets: Record<string, Items> = {}
    for (const k of BASKET_KEYS) if (v[k]) baskets[k] = v[k]!
    out[id] = { baskets, submittedAt: v.submittedAt || 0 }
  }
  return out
}

/** Products a coordinator may see and choose (legacy getVisibleProducts, generalised to excludedBranches). */
export function visibleProducts(cfg: LegacyConfig, coord: LegacyCoordinator): LegacyProduct[] {
  const fresh = cfg.freshExcluded ?? LEGACY_FRESH_EXCLUDED
  const bid = branchIdOf(coord.branch)
  return cfg.products.filter((p) => !toAlgoProduct(p, fresh).excludedBranches!.includes(bid))
}

export function roundOf(cfg: LegacyConfig): RoundState {
  return cfg.round ?? DEFAULT_ROUND
}
