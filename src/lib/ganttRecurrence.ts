import { addMonths } from 'date-fns'

export interface Span { start: Date; end: Date }

/**
 * Where a task that repeats every `stepMonths` falls inside [rangeStart, rangeEnd]:
 * its own start/end shifted by whole steps, clipped to the range. A half-yearly order
 * prepared 1–31 December shows in December and June — at its real dates, not pinned
 * to the end of the half.
 */
export function occurrencesInRange(start: Date, end: Date, stepMonths: number, rangeStart: Date, rangeEnd: Date): Span[] {
  const out: Span[] = []
  const maxK = Math.ceil(120 / stepMonths)
  for (let k = -maxK; k <= maxK; k++) {
    const s = addMonths(start, stepMonths * k)
    const e = addMonths(end, stepMonths * k)
    if (e < rangeStart || s > rangeEnd) continue
    out.push({ start: s < rangeStart ? rangeStart : s, end: e > rangeEnd ? rangeEnd : e })
  }
  return out
}

export const STEP_MONTHS: Record<string, number> = { 'רבעוני': 3, 'חצי-שנתי': 6, 'שנתי': 12, 'לפי חג': 12 }
