import { periodStart, type PeriodId } from './history'

const fmt = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fmtShort = new Intl.DateTimeFormat('he-IL', { month: 'short', year: '2-digit', timeZone: 'UTC' })

/** "ינואר 2027" */
export function periodLabel(id: PeriodId, short = false): string {
  const { year, month } = periodStart(id)
  return (short ? fmtShort : fmt).format(new Date(Date.UTC(year, month - 1, 1)))
}

/** Today's year and month in Jerusalem (UI only; the history module itself never reads the clock). */
export function jerusalemYearMonth(now: number): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: 'numeric' }).formatToParts(new Date(now))
  return { year: Number(parts.find((p) => p.type === 'year')!.value), month: Number(parts.find((p) => p.type === 'month')!.value) }
}
