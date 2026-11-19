import { expect, test } from 'vitest'
import { crmBranchFor, mapProducts, mapVotes } from '../data/legacyImport'

const crm = [{ id: 'B1', name: 'קטמון' }, { id: 'B2', name: 'גילה' }, { id: 'B3', name: 'שלומי קטמון' }, { id: 'B5', name: 'סניף בקעה' }]

test('old branch names and seed slugs map to CRM branches, never to non-voting order branches', () => {
  expect(crmBranchFor('katamon', crm)).toBe('B1')
  expect(crmBranchFor('קטמון', crm)).toBe('B1')
  expect(crmBranchFor('בקעה', crm)).toBe('B5')
  expect(crmBranchFor('רמות', crm)).toBeNull()
})

test('products keep ids and prices; exclusions become CRM branch ids (also the oldest veg rule)', () => {
  const p = mapProducts({ products: [
    { id: 'veg', name: 'ירקות', price: 17, max: 10, cat: 'fresh', emoji: '🥬', excludedBranches: ['baka', 'katamon'] },
    { id: 's1-0', name: 'דבש', price: 15, max: 10, cat: 'dry', emoji: '🍯', active: false },
  ] }, crm)
  expect(p[0]!.excludedBranches!.sort()).toEqual(['B1', 'B5'])
  expect(p[1]).toMatchObject({ id: 's1-0', price: 15, active: false, excludedBranches: [] })
  const oldest = mapProducts({ products: [{ id: 'veg', name: 'ירקות', price: 15, max: 10, cat: 'fresh', emoji: '🥬' }] }, crm)
  expect(oldest[0]!.excludedBranches!.sort()).toEqual(['B1', 'B5'])
})

test('votes: matched to CRM coordinators by name + branch; unknown names kept under a legacy id', () => {
  const coords = [{ uid: 'u1', name: 'ציפי', branchIds: ['B1'] }, { uid: 'u2', name: 'לאה ליבנת', branchIds: ['B2'] }]
  const r = mapVotes([
    { coordinatorId: 'tzi', coordinatorName: 'ציפי', branch: 'קטמון', submittedAt: 5, a: { pasta: 2 } },
    { coordinatorId: 'lea', coordinatorName: 'לאה  ליבנת', branch: 'גילה', submittedAt: 6, b: { rice: 1 }, round: 13 },
    { coordinatorId: 'est', coordinatorName: 'אסתי בראור', branch: 'קטמון', submittedAt: 7, a: { tuna: 1 } },
    { coordinatorId: 'yai', coordinatorName: 'יאיר', branch: 'רמות', submittedAt: 8 },
  ], 14, coords, crm)
  expect(r.votes.map((v) => [v.uid, v.branchId, v.round])).toEqual([['u1', 'B1', 14], ['u2', 'B2', 13], ['legacy-est', 'B1', 14]])
  expect(r.votes[0]!.baskets).toEqual({ a: { pasta: 2 } })
  expect(r.unmatched).toEqual(['אסתי בראור'])
  expect(r.noBranch).toEqual(['יאיר (רמות)'])
})
