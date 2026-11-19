import { expect, test } from 'vitest'
import { buildCycle, expectedVoters, productsForBranch } from '../data/cycle'
import { defaultBranchSettings, defaultConfig, sameBranch } from '../data/defaults'
import { computeCycleResults } from '../lib/algorithm'
import type { BranchSettings, VoteDoc } from '../data/model'

const crm = [{ id: 'B1', name: 'קטמון' }, { id: 'B2', name: 'גילה' }, { id: 'B3', name: 'נחלאות רב שמעון' }, { id: 'B4', name: 'בית שמש' }, { id: 'B5', name: 'בקעה' }]

test('CRM branch names map to voting defaults; non-voting order branches never vote', () => {
  expect(sameBranch('סניף קטמון', 'קטמון')).toBe(true)
  expect(defaultBranchSettings('קטמון')).toEqual({ votesIn: 'always', familiesRoutine: null, familiesHoliday: 250 })
  expect(defaultBranchSettings('נחלאות רב שמעון').votesIn).toBe('never')
  expect(defaultBranchSettings('בית שמש').votesIn).toBe('holidays')
  expect(defaultBranchSettings('סבתא רבקא').votesIn).toBe('never')
})

test('default catalog maps "veg hidden from Baka and Katamon" onto CRM branch ids', () => {
  const cfg = defaultConfig(crm)
  expect(cfg.products.find((p) => p.id === 'veg')!.excludedBranches!.sort()).toEqual(['B1', 'B5'])
  expect(productsForBranch(cfg, 'B1').some((p) => p.id === 'veg')).toBe(false)
  expect(productsForBranch(cfg, 'B2').some((p) => p.id === 'veg')).toBe(true)
})

test('cycle: only voters of participating branches, weights shared by the branch voters', () => {
  const settings: Record<string, BranchSettings> = Object.fromEntries(crm.map((b) => [b.id, defaultBranchSettings(b.name)]))
  const cfg = defaultConfig(crm)
  const vote = (uid: string, branchId: string): VoteDoc => ({ uid, branchId, name: uid, submittedAt: 1, baskets: { a: { pasta: 4 } } })
  const c = buildCycle(cfg, [vote('k1', 'B1'), vote('k2', 'B1'), vote('g1', 'B2'), vote('r1', 'B3'), vote('s1', 'B4')], settings)
  expect(c.snapshot.coordinators.map((x) => x.id).sort()).toEqual(['g1_B2', 'k1_B1', 'k2_B1'])  // Rav Shimon + Beit Shemesh (routine) out
  const w = Object.fromEntries(c.snapshot.coordinators.map((x) => [x.id, x.weight]))
  expect(w.k1_B1! + w.k2_B1!).toBeCloseTo(c.branchWeights.B1!, 10)
  expect(w.k1_B1).toBeCloseTo(w.k2_B1!, 10)
  const r = computeCycleResults({ cycle: c.snapshot, votes: c.votes })
  expect(r.baskets.a!.winners[0]!.pid).toBe('pasta')
  const holiday = buildCycle({ ...cfg, round: { num: 2, open: true, orderType: 'pesach' } }, [vote('s1', 'B4')], settings)
  expect(holiday.snapshot.coordinators.map((x) => x.id)).toEqual(['s1_B4'])
})

test('expected voters: one per coordinator and participating branch', () => {
  const settings: Record<string, BranchSettings> = Object.fromEntries(crm.map((b) => [b.id, defaultBranchSettings(b.name)]))
  const ev = expectedVoters([{ uid: 'u', name: 'u', branchIds: ['B1', 'B3', 'B4'] }], settings, 'routine')
  expect(ev.map((e) => e.id)).toEqual(['u_B1'])
})

test('local draft follows its key: switching coordinator/branch never carries another draft over', async () => {
  const { renderHook, act } = await import('@testing-library/react')
  const { useLocalDraft } = await import('../data/draft')
  localStorage.clear()
  const { result, rerender } = renderHook(({ k }) => useLocalDraft<Record<string, number>>(k, {}), { initialProps: { k: 'a' } })
  act(() => result.current[1]((s) => ({ ...s, pasta: 4 })))
  expect(result.current[0]).toEqual({ pasta: 4 })
  rerender({ k: 'b' })
  expect(result.current[0]).toEqual({})
  act(() => result.current[1]((s) => ({ ...s, rice: 1 })))
  rerender({ k: 'a' })
  expect(result.current[0]).toEqual({ pasta: 4 })
  expect(JSON.parse(localStorage.getItem('b')!)).toEqual({ rice: 1 })
})
