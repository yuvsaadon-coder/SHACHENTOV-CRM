import { describe, expect, it } from 'vitest'
import { validateOps } from '../../netlify/functions/_branchOps'

describe('validateOps', () => {
  it('accepts the operational fields and trims text', () => {
    const r = validateOps({ distributionDay: ' ראשון ', weeklyBaskets: 120, acceptsGroups: true, address: '' })
    expect(r).toEqual({ ok: true, update: { distributionDay: 'ראשון', weeklyBaskets: 120, acceptsGroups: true, address: null } })
  })
  it('refuses fields a coordinator may not change', () => {
    for (const bad of [{ name: 'x' }, { type: 'food' }, { city: 'y' }, { createdAt: 1 }]) {
      expect(validateOps(bad).ok).toBe(false)
    }
  })
  it('refuses bad numbers and types', () => {
    expect(validateOps({ weeklyBaskets: -1 }).ok).toBe(false)
    expect(validateOps({ weeklyBaskets: 1.5 }).ok).toBe(false)
    expect(validateOps({ weeklyBaskets: '12' }).ok).toBe(false)
    expect(validateOps({ acceptsGroups: 'yes' }).ok).toBe(false)
    expect(validateOps({ address: 5 }).ok).toBe(false)
  })
  it('clears a number with null and refuses empty or oversized input', () => {
    expect(validateOps({ monthlyBaskets: null })).toEqual({ ok: true, update: { monthlyBaskets: null } })
    expect(validateOps({}).ok).toBe(false)
    expect(validateOps({ address: 'א'.repeat(201) }).ok).toBe(false)
    expect(validateOps([1]).ok).toBe(false)
  })
})
