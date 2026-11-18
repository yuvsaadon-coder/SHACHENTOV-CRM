import { describe, expect, it } from 'vitest'
import { normalizePartner, normalizeSupplier } from '../lib/hqNormalize'

describe('hq normalize', () => {
  it('fills missing arrays so legacy partner docs do not crash the UI', () => {
    const p = normalizePartner('p', { name: 'ישן' })
    expect(p.categories).toEqual([])
    expect(p.branchIds).toEqual([])
    expect(p.partnerType).toBe('partner')
  })
  it('fills missing arrays on suppliers', () => {
    const s = normalizeSupplier('s', {})
    expect(s.categories).toEqual([])
    expect(s.branchIds).toEqual([])
  })
})
