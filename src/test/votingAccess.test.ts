import { describe, expect, it } from 'vitest'
import { canManageVoting } from '../lib/votingAccess'

describe('canManageVoting', () => {
  it('lets system managers, the suppliers coordinator and the Jerusalem coordinator in', () => {
    expect(canManageVoting('admin', null)).toBe(true)
    expect(canManageVoting('hq', 'SUP')).toBe(true)
    expect(canManageVoting('hq', 'JLM')).toBe(true)
  })
  it('keeps everyone else out', () => {
    for (const d of ['CEO', 'FIN', 'DON', 'DES', 'PUB', 'VOL', null]) expect(canManageVoting('hq', d)).toBe(false)
    expect(canManageVoting('coordinator', null)).toBe(false)
  })
})
