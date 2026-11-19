// Voting weights in the CRM (owner decisions 19-20.11.2026). Pure.
//
// Branch weight = sqrt(families) normalised so the average participating branch weighs 1:
//   bigger branches weigh more, but not proportionally (a branch 4.5x larger weighs ~2.1x), so small branches
//   still count. Routine (half-year) orders use the routine family count, holiday orders the holiday count.
// Voter weight = branch weight / number of coordinators of that branch WHO VOTED in the round, so a branch always
//   carries its full weight as long as one of its coordinators voted, however many coordinators it has.
// Branches with no family count weigh 1 (the average) until the admin fills it in.
// Non-voting order branches (e.g. Nachlaot Rav Shimon) take no part: they receive the weighted basket.
import type { BranchSettings } from './model'

export type OrderKind = 'routine' | 'holiday'

export function participates(s: BranchSettings | undefined, kind: OrderKind): boolean {
  if (!s) return false
  return s.votesIn === 'always' || (kind === 'holiday' && s.votesIn === 'holidays')
}

export function familiesOf(s: BranchSettings, kind: OrderKind): number | null {
  const v = kind === 'holiday' ? s.familiesHoliday ?? s.familiesRoutine : s.familiesRoutine ?? s.familiesHoliday
  return v != null && v > 0 ? v : null
}

/** Weight of every participating branch for the order kind. */
export function branchWeights(settings: Record<string, BranchSettings>, kind: OrderKind): Record<string, number> {
  const ids = Object.keys(settings).filter((id) => participates(settings[id], kind))
  const roots = ids.map((id) => familiesOf(settings[id]!, kind)).filter((f): f is number => f != null).map(Math.sqrt)
  const mean = roots.length ? roots.reduce((a, b) => a + b, 0) / roots.length : 1
  return Object.fromEntries(ids.map((id) => {
    const f = familiesOf(settings[id]!, kind)
    return [id, f == null ? 1 : Math.sqrt(f) / mean]
  }))
}

/** Weight of each submitted vote: its branch weight shared equally by the branch's voters. */
export function voterWeights(votes: { id: string; branchId: string }[], bw: Record<string, number>): Record<string, number> {
  const count = new Map<string, number>()
  for (const v of votes) if (bw[v.branchId] != null) count.set(v.branchId, (count.get(v.branchId) ?? 0) + 1)
  const out: Record<string, number> = {}
  for (const v of votes) {
    const n = count.get(v.branchId)
    if (n) out[v.id] = bw[v.branchId]! / n
  }
  return out
}
