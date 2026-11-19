// Defaults used until the admin saves real values in the CRM (catalog, baskets, branch participation).
import seedJson from '../seed/seed.json'
import { normalizeName } from '../lib/quotes/match'
import type { BranchSettings, VotingBasket, VotingConfig, VotingProduct } from './model'

interface SeedShape {
  branches: { id: string; name: string; votesIn?: 'always' | 'holidays' }[]
  products: (VotingProduct & { excludedBranches?: string[] })[]
  basketTemplate: VotingBasket[]
}
const seed = seedJson as unknown as SeedShape

/** Family counts of the voting branches in the Pesach 2026 order file (holiday). Routine counts start empty. */
const PESACH_2026_FAMILIES: Record<string, number> = {
  'בקעה': 115, 'גילה': 76, 'נווה יעקב': 55, 'נחלאות': 85, 'קטמון': 250, 'קרית מנחם': 150, 'רמות': 85,
  'תל אביב': 90, 'קדימה': 75, 'בית שמש': 40,
}

/** A CRM branch name matches a voting branch name when it equals it or contains it as a whole word ("סניף קטמון"). */
export function sameBranch(crmName: string, votingName: string): boolean {
  const a = normalizeName(crmName), b = normalizeName(votingName)
  return a === b || ` ${a} `.includes(` ${b} `)
}

const seedBranchFor = (crmName: string) =>
  // longest match first so "נחלאות רב שמעון" is not mistaken for "נחלאות"
  [...seed.branches].sort((x, y) => y.name.length - x.name.length).find((b) => normalizeName(crmName) === normalizeName(b.name))
  ?? seed.branches.find((b) => sameBranch(crmName, b.name) && !/רב שמעון|שלומי|סבתא/.test(crmName))

/** Default participation for a CRM branch, by its name. Unknown branches do not vote (they get the weighted basket). */
export function defaultBranchSettings(crmName: string): BranchSettings {
  const sb = seedBranchFor(crmName)
  if (!sb) return { votesIn: 'never', familiesRoutine: null, familiesHoliday: null }
  return { votesIn: sb.votesIn ?? 'always', familiesRoutine: null, familiesHoliday: PESACH_2026_FAMILIES[sb.name] ?? null }
}

/** Default catalog: the 31 products, with the seed's per-branch exclusions mapped onto CRM branch ids by name. */
export function defaultConfig(crmBranches: { id: string; name: string }[]): VotingConfig {
  const nameOfSeed = new Map(seed.branches.map((b) => [b.id, b.name]))
  const crmIdsFor = (seedIds: string[] = []) =>
    crmBranches.filter((c) => seedIds.some((sid) => sameBranch(c.name, nameOfSeed.get(sid) ?? sid) && !/רב שמעון|שלומי|סבתא/.test(c.name))).map((c) => c.id)
  return {
    products: seed.products.map((p) => ({ ...p, excludedBranches: crmIdsFor(p.excludedBranches) })),
    baskets: seed.basketTemplate.map((b) => ({ id: b.id, name: b.name, budget: b.budget })),
    round: { num: 1, open: true },
  }
}
