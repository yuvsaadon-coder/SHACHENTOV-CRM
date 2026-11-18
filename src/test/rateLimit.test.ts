import { describe, expect, it } from 'vitest'
import { afterFailure, isLocked, LOCK_MS, WINDOW_MS } from '../../netlify/functions/_rateLimitCore'

describe('login rate limit', () => {
  it('locks on the 4th failure and not before', () => {
    let st = undefined as ReturnType<typeof afterFailure> | undefined
    for (let i = 1; i <= 3; i++) {
      st = afterFailure(st, 1000, 4)
      expect(isLocked(st, 1000)).toBe(false)
    }
    st = afterFailure(st, 1000, 4)
    expect(isLocked(st, 1000)).toBe(true)
    expect(st.lockedUntil).toBe(1000 + LOCK_MS)
  })

  it('unlocks after the lock period', () => {
    const st = afterFailure(afterFailure(afterFailure(afterFailure(undefined, 0, 4), 0, 4), 0, 4), 0, 4)
    expect(isLocked(st, LOCK_MS - 1)).toBe(true)
    expect(isLocked(st, LOCK_MS + 1)).toBe(false)
  })

  it('starts counting again once the window has passed', () => {
    const old = afterFailure(afterFailure(undefined, 0, 4), 0, 4)
    const next = afterFailure(old, WINDOW_MS + 1, 4)
    expect(next.count).toBe(1)
    expect(isLocked(next, WINDOW_MS + 1)).toBe(false)
  })
})
