import { describe, expect, it } from 'vitest'
import { toCSV } from '../utils/export'

describe('toCSV', () => {
  it.each([
    ['=SUM(A1:A2)', "'=SUM(A1:A2)"],
    ['+1', "'+1"],
    ['-2', "'-2"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['\t=1+1', "'\t=1+1"],
    ['\r=1+1', "'\r=1+1"],
  ])('neutralizes spreadsheet formula trigger %j', (value, expected) => {
    expect(toCSV([[value]])).toBe(`"${expected}"`)
  })

  it('preserves Unicode, commas, quotes, and line breaks with valid CSV quoting', () => {
    expect(toCSV([['שלום, עולם', 'הוא אמר "כן"', 'שורה ראשונה\nשורה שנייה']])).toBe(
      '"שלום, עולם","הוא אמר ""כן""","שורה ראשונה\nשורה שנייה"',
    )
  })

  it('does not alter safe values or empty cells', () => {
    expect(toCSV([[' text', 42, null, undefined]])).toBe('" text","42","",""')
  })
})
