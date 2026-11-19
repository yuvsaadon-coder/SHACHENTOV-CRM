import { expect, test } from 'vitest'
import { branchWeights, voterWeights } from '../data/weights'
import type { BranchSettings } from '../data/model'

// Pesach 2026 family counts (holiday) — the table shown to the owner
const s = (votesIn: BranchSettings['votesIn'], familiesHoliday: number | null, familiesRoutine: number | null = null): BranchSettings => ({ votesIn, familiesHoliday, familiesRoutine })
const settings: Record<string, BranchSettings> = {
  baka: s('always', 115), gilo: s('always', 76), neve: s('always', 55), nachlaot: s('always', 85),
  katamon: s('always', 250), km: s('always', 150), ramot: s('always', 85),
  ta: s('holidays', 90), kadima: s('holidays', 75), bs: s('holidays', 40),
  ravShimon: s('never', 50),
}

test('routine order: sqrt of families over the 7 always-voting branches, average 1', () => {
  const w = branchWeights(settings, 'routine')
  expect(Object.keys(w).sort()).toEqual(['baka', 'gilo', 'katamon', 'km', 'nachlaot', 'neve', 'ramot'])
  expect(w.katamon).toBeCloseTo(1.51, 2)
  expect(w.km).toBeCloseTo(1.17, 2)
  expect(w.neve).toBeCloseTo(0.71, 2)
  expect(Object.values(w).reduce((a, b) => a + b, 0) / 7).toBeCloseTo(1, 10)
})

test('holiday order adds the holiday branches; non-voting branches never take part', () => {
  const w = branchWeights(settings, 'holiday')
  expect(Object.keys(w)).toHaveLength(10)
  expect(w.ravShimon).toBeUndefined()
  expect(Object.values(w).reduce((a, b) => a + b, 0) / 10).toBeCloseTo(1, 10)
})

test('routine and holiday counts are used for their own order kind', () => {
  const two = { a: s('always', 400, 100), b: s('always', 100, 100) }
  expect(branchWeights(two, 'routine').a).toBeCloseTo(1, 10)
  expect(branchWeights(two, 'holiday').a).toBeGreaterThan(branchWeights(two, 'holiday').b!)
})

test('a branch without a family count weighs the average (1)', () => {
  expect(branchWeights({ a: s('always', null), b: s('always', 100) }, 'routine').a).toBe(1)
})

test('voter weight = branch weight / voters of that branch; non-participating branch gets none', () => {
  const bw = { katamon: 1.5, gilo: 0.8 }
  const vw = voterWeights([
    { id: 'k1', branchId: 'katamon' }, { id: 'k2', branchId: 'katamon' }, { id: 'g1', branchId: 'gilo' }, { id: 'x', branchId: 'ravShimon' },
  ], bw)
  expect(vw).toEqual({ k1: 0.75, k2: 0.75, g1: 0.8 })
})
