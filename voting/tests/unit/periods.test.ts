// Owner decision 18.11.2026: half-year = 24 weeks. Weekly -> 24 distributions, every two weeks -> 12.
import { expect, test } from 'vitest'
import { HALF_YEAR_WEEKS, branchDistributionPlan, weeksInPeriodFor } from '../../src/lib/algorithm'

test('half-year counts 24 weeks', () => {
  expect(HALF_YEAR_WEEKS).toBe(24)
  expect(weeksInPeriodFor('half_year_1', 1)).toBe(24)
  expect(weeksInPeriodFor('half_year_2', 2)).toBe(24)
})

test('weekly branch: 24 distributions in a half-year', () => {
  const p = branchDistributionPlan({ cycleType: 'half_year_1', frequencyWeeks: 1, avgBaskets: 50 })
  expect(p.distributions).toBe(24)
  expect(p.total).toBe(1200)
  expect(p.counts).toEqual({ a: 600, b: 600, a_ext: 600, b_ext: 600 })
})

test('every-two-weeks branch: 12 distributions in a half-year', () => {
  const p = branchDistributionPlan({ cycleType: 'half_year_2', frequencyWeeks: 2, avgBaskets: 51 })
  expect(p.distributions).toBe(12)
  expect(p.total).toBe(612)
  expect(p.counts.a).toBe(306)
})

test('holidays stay one distribution whatever the frequency', () => {
  for (const f of [1, 2, 4]) {
    expect(branchDistributionPlan({ cycleType: 'pesach', frequencyWeeks: f, avgBaskets: 85 }).distributions).toBe(1)
  }
  expect(branchDistributionPlan({ cycleType: 'rosh_hashana', frequencyWeeks: 2, avgBaskets: 85 }).counts).toEqual({ a: 43, b: 42, a_ext: 43, b_ext: 42 })
})

test('per-branch view: weight split equally within a branch; weighted view keeps individual weights', async () => {
  const { computeCycleResults, computeBranchBaskets } = await import('../../src/lib/algorithm')
  const products = [
    { id: 'pasta', name: 'פסטה', price: 2, max: 10, cat: 'dry' },
    { id: 'rice', name: 'אורז', price: 2, max: 10, cat: 'dry' },
  ]
  // same branch, unequal weights: A (1.0) wants pasta x4, B (0.5) wants rice x4, budget fits only one
  const cycle = {
    products,
    coordinators: [{ id: 'A', branchId: 'x', weight: 1 }, { id: 'B', branchId: 'x', weight: 0.5 }],
    baskets: [{ id: 'a', budget: 8, group: 'main', slot: 'A' as const }],
  }
  const votes = { A: { baskets: { a: { pasta: 4 } }, submittedAt: 1 }, B: { baskets: { a: { rice: 4 } }, submittedAt: 2 } }
  const r = computeCycleResults({ cycle, votes })
  expect(r.baskets.a!.winners.map((w) => w.pid)).toEqual(['pasta'])        // weighted: A outweighs B
  const br = computeBranchBaskets({ cycle, results: r }).x!.baskets.a!
  expect(br.ties).toHaveLength(1)                                           // per branch: equal say -> a tie
  expect(br.voterWeight).toBe(1.5)                                          // branch total weight unchanged
})
