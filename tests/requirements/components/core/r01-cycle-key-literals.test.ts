// TEST-R01 — currentCycleKey literal-value characterization (V; C).
// Baseline: src/hooks/useRecurringTaskReset.ts exports currentCycleKey().
// Expected values are hand-written literals per the plan — never re-derived
// from a copy of the production switch.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { currentCycleKey } from '../../../../src/hooks/useRecurringTaskReset'

describe('TEST-R01 currentCycleKey', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('TEST-R01.currentCycleKey.literal-values-september-2026', () => {
    vi.setSystemTime(new Date('2026-09-06T12:00:00'))
    expect(currentCycleKey('חד-פעמי')).toBe(null)
    expect(currentCycleKey('חודשי')).toBe('2026-09')
    expect(currentCycleKey('שוטף')).toBe('2026-09')
    expect(currentCycleKey('רבעוני')).toBe('2026-Q3')
    expect(currentCycleKey('חצי-שנתי')).toBe('2026-H2')
    expect(currentCycleKey('שנתי')).toBe('2026')
    expect(currentCycleKey('לפי חג')).toBe('2026')
  })

  it('TEST-R01.currentCycleKey.month-boundary-sep-oct', () => {
    vi.setSystemTime(new Date('2026-09-30T23:59:59'))
    expect(currentCycleKey('חודשי')).toBe('2026-09')
    expect(currentCycleKey('שוטף')).toBe('2026-09')
    expect(currentCycleKey('רבעוני')).toBe('2026-Q3')

    vi.setSystemTime(new Date('2026-10-01T00:00:00'))
    expect(currentCycleKey('חודשי')).toBe('2026-10')
    expect(currentCycleKey('שוטף')).toBe('2026-10')
    // Q3 = Jul/Aug/Sep, Q4 starts October.
    expect(currentCycleKey('רבעוני')).toBe('2026-Q4')
  })

  it('TEST-R01.currentCycleKey.half-year-boundary-jun-jul', () => {
    vi.setSystemTime(new Date('2026-06-30T23:59:59'))
    expect(currentCycleKey('חצי-שנתי')).toBe('2026-H1')
    expect(currentCycleKey('רבעוני')).toBe('2026-Q2')
    expect(currentCycleKey('חודשי')).toBe('2026-06')

    vi.setSystemTime(new Date('2026-07-01T00:00:00'))
    expect(currentCycleKey('חצי-שנתי')).toBe('2026-H2')
    expect(currentCycleKey('רבעוני')).toBe('2026-Q3')
    expect(currentCycleKey('חודשי')).toBe('2026-07')
  })

  it('TEST-R01.currentCycleKey.year-boundary-dec-jan', () => {
    vi.setSystemTime(new Date('2026-12-31T23:59:59'))
    expect(currentCycleKey('שנתי')).toBe('2026')
    expect(currentCycleKey('לפי חג')).toBe('2026')
    expect(currentCycleKey('חצי-שנתי')).toBe('2026-H2')
    expect(currentCycleKey('רבעוני')).toBe('2026-Q4')
    expect(currentCycleKey('חודשי')).toBe('2026-12')

    vi.setSystemTime(new Date('2027-01-01T00:00:00'))
    expect(currentCycleKey('שנתי')).toBe('2027')
    expect(currentCycleKey('לפי חג')).toBe('2027')
    expect(currentCycleKey('חצי-שנתי')).toBe('2027-H1')
    expect(currentCycleKey('רבעוני')).toBe('2027-Q1')
    expect(currentCycleKey('חודשי')).toBe('2027-01')
  })

  it('TEST-R01.currentCycleKey.leap-february-boundary', () => {
    // 2028 is a leap year. The monthly (YYYY-MM) key must remain "2028-02"
    // across the leap day Feb 28 → Feb 29, then flip to "2028-03" on Mar 1.
    // (Quarter/half/year keys don't change across any February boundary,
    // so we don't assert flips on them here — the monthly key is the one
    // whose format actually changes across this leap-adjacent transition.)
    vi.setSystemTime(new Date('2028-02-28T23:59:59'))
    expect(currentCycleKey('חודשי')).toBe('2028-02')

    vi.setSystemTime(new Date('2028-02-29T12:00:00'))
    expect(currentCycleKey('חודשי')).toBe('2028-02')

    vi.setSystemTime(new Date('2028-03-01T00:00:00'))
    expect(currentCycleKey('חודשי')).toBe('2028-03')
    expect(currentCycleKey('רבעוני')).toBe('2028-Q1')
  })
})
