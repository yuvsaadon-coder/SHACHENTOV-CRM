import { describe, expect, it } from 'vitest'
import { occurrencesInRange } from '../lib/ganttRecurrence'

const d = (s: string) => new Date(`${s}T00:00:00`)
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

describe('gantt recurrence', () => {
  it('a half-yearly task shows at its own months, not at the end of each half', () => {
    const occ = occurrencesInRange(d('2026-12-01'), d('2026-12-31'), 6, d('2027-01-01'), d('2027-12-31'))
    expect(occ.map((o) => `${iso(o.start)}..${iso(o.end)}`)).toEqual(['2027-06-01..2027-06-30', '2027-12-01..2027-12-31'])
  })

  it('a February half-yearly task repeats in August', () => {
    const occ = occurrencesInRange(d('2027-02-01'), d('2027-02-28'), 6, d('2027-01-01'), d('2027-12-31'))
    expect(occ.map((o) => iso(o.start))).toEqual(['2027-02-01', '2027-08-01'])
  })

  it('clips to the visible range, and a span crossing New Year shows at both ends', () => {
    const occ = occurrencesInRange(d('2026-12-20'), d('2027-01-10'), 12, d('2027-01-01'), d('2027-12-31'))
    expect(occ.map((o) => `${iso(o.start)}..${iso(o.end)}`)).toEqual(['2027-01-01..2027-01-10', '2027-12-20..2027-12-31'])
  })
})
