import { expect, test } from 'vitest'
import { orderPeriod, recommendBudgets } from '../../src/lib/rounds/recommend'

test('order periods: holidays fall in their half-year', () => {
  expect(orderPeriod('half_year_1', 2027)).toBe('2027-H1')
  expect(orderPeriod('half_year_2', 2027)).toBe('2027-H2')
  expect(orderPeriod('pesach', 2027)).toBe('2027-H1')
  expect(orderPeriod('rosh_hashana', 2027)).toBe('2027-H2')
})

const baskets = [{ id: 'a', budget: 80 }, { id: 'a_ext', budget: 20 }]

test('recommendation follows the price change of the basket coordinators voted for (snapshot prices)', () => {
  const votes = [
    { weight: 1, baskets: { a: { pasta: 10, rice: 5 } } },       // 10*2 + 5*10 = 70 of 80
    { weight: 0.5, baskets: { a: { pasta: 20, rice: 4 } } },     // 40 + 40 = 80 of 80
  ]
  const r = recommendBudgets({ baskets, votes, surveyPrices: { pasta: 2, rice: 10 }, currentPrices: { pasta: 2.2, rice: 10 }, trackerChange: 0.5 })
  // voted basket: pasta 20, rice 7 -> 40+70=110 before, 44+70=114 after -> +3.64%
  expect(r[0]!.priceChange).toBeCloseTo(114 / 110 - 1, 10)
  expect(r[0]!.priceSource).toBe('snapshot')
  expect(r[0]!.recommended).toBe(83)                             // ceil(80 * 1.0364)
  expect(r[0]!.fillRate).toBeCloseTo((1 * 70 / 80 + 0.5 * 1) / 1.5, 10)
  // nobody filled the extension -> no snapshot change -> tracker fallback
  expect(r[1]).toMatchObject({ fillRate: null, priceSource: 'tracker', recommended: 30 })
})

test('without a snapshot the tracker change is used; without anything the budget stays', () => {
  const votes = [{ weight: 1, baskets: { a: { pasta: 10 } } }]
  expect(recommendBudgets({ baskets, votes, surveyPrices: null, currentPrices: { pasta: 2 }, trackerChange: 0.02 })[0]).toMatchObject({ priceSource: 'tracker', recommended: 82 })
  expect(recommendBudgets({ baskets, votes, surveyPrices: null, currentPrices: { pasta: 2 }, trackerChange: null })[0]).toMatchObject({ priceSource: 'none', recommended: 80 })
})

test('price drop lowers the recommendation; products missing today are left out of the change', () => {
  const votes = [{ weight: 1, baskets: { a: { pasta: 10, gone: 3 } } }]
  const r = recommendBudgets({ baskets, votes, surveyPrices: { pasta: 2, gone: 10 }, currentPrices: { pasta: 1.8 }, trackerChange: null })
  expect(r[0]!.priceChange).toBeCloseTo(-0.1, 10)
  expect(r[0]!.recommended).toBe(72)
})
