// Differential test: the TypeScript port must produce exactly what the reference implementation produces.
import { describe, expect, test } from 'vitest'
import seedJson from '../../seed/seed.json'
import * as ref from '../../reference/algorithm.mjs'
import { computeCycleResults, computeBranchBaskets, compareViews } from '../../src/lib/algorithm'
import type { Basket, Coordinator, Items, OrderBranch, Product, Vote } from '../../src/lib/algorithm'

const seed = seedJson as unknown as { products: Product[]; coordinators: Coordinator[]; basketTemplate: Basket[]; orderBranches: OrderBranch[] }
const cycle = { products: seed.products, coordinators: seed.coordinators, baskets: seed.basketTemplate }
const refAny = ref as unknown as Record<string, (a: unknown) => unknown>

// Deterministic PRNG (mulberry32) so failures are reproducible.
function rng(seedN: number) {
  let a = seedN >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomVotes(r: () => number): Record<string, Vote> {
  const votes: Record<string, Vote> = {}
  for (const c of seed.coordinators) {
    if (r() < 0.25) continue
    const baskets: Record<string, Items> = {}
    for (const b of seed.basketTemplate) {
      const items: Items = {}
      const n = Math.floor(r() * 7)
      for (let i = 0; i < n; i++) {
        const p = seed.products[Math.floor(r() * seed.products.length)]!
        items[p.id] = 1 + Math.floor(r() * (b.budget > 30 ? 5 : 2))
      }
      baskets[b.id] = items
    }
    votes[c.id] = { baskets, submittedAt: Math.floor(r() * 1000) }
  }
  return votes
}

describe('TS port matches reference/algorithm.mjs', () => {
  test.each(Array.from({ length: 300 }, (_, i) => i))('random cycle #%i', (i) => {
    const r = rng(1000 + i)
    const votes = randomVotes(r)
    const options = { allowPartialFit: r() < 0.3, align: r() < 0.9 }
    const mine = computeCycleResults({ cycle, votes, options })
    const theirs = refAny.computeCycleResults!({ cycle, votes, options })
    expect(mine).toEqual(theirs)

    const orderBranches = seed.orderBranches.map((b) => ({ ...b, counts: { a: 10, b: 7, a_ext: 10, b_ext: 7 } }))
    const args = {
      results: mine, branchResults: computeBranchBaskets({ cycle, results: mine }), products: seed.products,
      orderBranches, votingBranchIds: ['baka', 'gilo', 'neve-yaakov', 'nachlaot', 'katamon', 'ramot', 'kiryat-menachem'],
      cycleType: 'pesach' as const,
    }
    const refArgs = { ...args, branchResults: refAny.computeBranchBaskets!({ cycle, results: theirs }) }
    expect(compareViews(args)).toEqual(refAny.compareViews!(refArgs))
  })
})
