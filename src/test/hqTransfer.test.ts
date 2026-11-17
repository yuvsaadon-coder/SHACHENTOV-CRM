import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn(), writeBatch: vi.fn(),
}))

import { partnerToSupplier, supplierToPartner } from '../lib/hqTransfer'
import type { HQPartner } from '../types'

const partner = {
  id: 'p1', name: 'חברת אשראי', partnerType: 'payment', categories: ['finance', 'technology'],
  status: 'pilot', websiteUrl: 'https://x.co', adminUrl: 'https://x.co/admin',
  internalContactId: 'c1', externalContactId: 'c2', notes: 'n',
  paymentMethods: ['credit', 'bit'], receiptGeneration: 'automatic', usedFor: ['donations'],
  active: true, createdBy: 'u', createdAt: {} as never, updatedAt: {} as never,
} as HQPartner

describe('hq transfer mapping', () => {
  it('partner -> supplier keeps links, contacts and payment data', () => {
    const s = partnerToSupplier(partner)
    expect(s.websiteUrl).toBe('https://x.co')
    expect(s.contactIds).toEqual(['c1', 'c2'])
    expect(s.paymentMethods).toEqual(['credit', 'bit'])
    expect(s.status).toBe('inactive')
    expect(Object.values(s)).not.toContain(undefined)
  })

  it('round trip partner -> supplier -> partner is lossless', () => {
    const back = supplierToPartner({ id: 's', ...partnerToSupplier(partner) } as never)
    expect(back).toMatchObject({
      partnerType: 'payment', categories: ['finance', 'technology'], status: 'pilot',
      websiteUrl: 'https://x.co', adminUrl: 'https://x.co/admin',
      internalContactId: 'c1', externalContactId: 'c2', receiptGeneration: 'automatic',
      usedFor: ['donations'], paymentMethods: ['credit', 'bit'],
    })
  })
})
