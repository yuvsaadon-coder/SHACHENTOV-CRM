// TEST-R05 — holiday-anchored task current display (V+B; C).
// Only the .current-holiday-display (C) split is implemented (per §6.1).
// The Hebrew-anchor policy itself is U — no oracle invented.
//
// Baseline: src/hooks/useRecurringTaskReset.ts's 'לפי חג' branch returns
// `${y}` with NO holiday-date computation. Task.holidayAnchor is stored
// (src/types/index.ts) but not consulted by currentCycleKey. This test
// characterizes the current fixed-Gregorian-year-only key across two
// calendar years.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { currentCycleKey } from '../../../../src/hooks/useRecurringTaskReset'

describe('TEST-R05 holiday-anchored current display (C)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('TEST-R05.current-holiday-display.year-2026', () => {
    vi.setSystemTime(new Date('2026-09-06T12:00:00'))
    // A task with frequency 'לפי חג' and a non-null holidayAnchor
    // string exists in the type system (Task.holidayAnchor: string | null),
    // but currentCycleKey ignores holidayAnchor entirely and returns just
    // the Gregorian year.
    expect(currentCycleKey('לפי חג')).toBe('2026')
  })

  it('TEST-R05.current-holiday-display.year-2027', () => {
    vi.setSystemTime(new Date('2027-04-15T12:00:00'))
    expect(currentCycleKey('לפי חג')).toBe('2027')
  })

  it('TEST-R05.current-holiday-display.identical-across-months-in-same-year', () => {
    // The key does not vary with the Gregorian month within a year —
    // no Hebrew-calendar-date computation is performed anywhere in the
    // exercised code path. Same year → same key regardless of month.
    vi.setSystemTime(new Date('2026-01-15T12:00:00'))
    const jan = currentCycleKey('לפי חג')
    vi.setSystemTime(new Date('2026-06-15T12:00:00'))
    const jun = currentCycleKey('לפי חג')
    vi.setSystemTime(new Date('2026-12-15T12:00:00'))
    const dec = currentCycleKey('לפי חג')
    expect(jan).toBe('2026')
    expect(jun).toBe('2026')
    expect(dec).toBe('2026')
  })
})
