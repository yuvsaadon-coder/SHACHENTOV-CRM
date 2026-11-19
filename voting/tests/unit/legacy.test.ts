import { expect, test } from 'vitest'
import { defaultConfig, toAlgoVotes, toCycleSnapshot, visibleProducts, type LegacyConfig } from '../../src/data/legacy'
import { computeCycleResults } from '../../src/lib/algorithm'

test('default config mirrors the legacy data.js: 14 coordinators, weight 9, 31 products, 4 baskets', () => {
  const cfg = defaultConfig()
  expect(cfg.coordinators).toHaveLength(14)
  expect(cfg.coordinators.reduce((s, c) => s + c.weight, 0)).toBe(9)
  expect(cfg.products).toHaveLength(31)
  expect(cfg.baskets.map((b) => [b.id, b.budget])).toEqual([['a', 80], ['a_ext', 20], ['b', 80], ['b_ext', 20]])
  expect(cfg.coordinators.find((c) => c.id === 'yoh')!.branch).toBe('בקעה')
})

test('veg is hidden from בקעה and קטמון only', () => {
  const cfg = defaultConfig()
  const coord = (branch: string) => ({ id: 'x', name: 'x', branch, weight: 1 })
  expect(visibleProducts(cfg, coord('בקעה')).some((p) => p.id === 'veg')).toBe(false)
  expect(visibleProducts(cfg, coord('קטמון')).some((p) => p.id === 'veg')).toBe(false)
  expect(visibleProducts(cfg, coord('גילה')).some((p) => p.id === 'veg')).toBe(true)
})

test('a legacy live config (no excludedBranches, Hebrew branch names) maps to the algorithm shape', () => {
  const live: LegacyConfig = {
    products: [{ id: 'veg', name: 'ירקות', price: 15, max: 10, cat: 'fresh', emoji: '🥬' }, { id: 'pasta', name: 'פסטה', price: 2.6, max: 10, cat: 'dry', emoji: '🍝' }],
    coordinators: [{ id: 'yoh', name: 'יוחאי', branch: 'בקעה', weight: 1 }, { id: 'lea', name: 'לאה', branch: 'גילה', weight: 1 }],
    baskets: [{ id: 'a', name: "סל א'", budget: 80, desc: 'הסל הבסיסי' }, { id: 'b', name: "סל ב'", budget: 80 }],
  }
  const snap = toCycleSnapshot(live)
  expect(snap.products.find((p) => p.id === 'veg')!.excludedBranches).toEqual(['baka', 'katamon'])
  expect(snap.coordinators.map((c) => c.branchId)).toEqual(['baka', 'gilo'])
  expect(snap.baskets.map((b) => [b.id, b.group, b.slot])).toEqual([['a', 'main', 'A'], ['b', 'main', 'B']])

  const votes = toAlgoVotes({
    yoh: { coordinatorId: 'yoh', coordinatorName: 'יוחאי', branch: 'בקעה', submittedAt: 5, a: { veg: 1, pasta: 2 }, b: { pasta: 1 } },
  })
  expect(votes.yoh).toEqual({ baskets: { a: { veg: 1, pasta: 2 }, b: { pasta: 1 } }, submittedAt: 5 })
  const r = computeCycleResults({ cycle: snap, votes })
  expect(r.issues.some((i) => i.type === 'ineligible_product')).toBe(true) // yoh (בקעה) cannot pick veg
})
