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
