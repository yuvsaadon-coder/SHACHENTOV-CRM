import { describe, expect, it } from 'vitest'
import {
  buildReport, fillTemplate, isMissingReply, replyState, toWaNumber, tomorrowISO, waUrl,
} from '../lib/volunteerUtils'

describe('volunteer utils', () => {
  it('fills placeholders including ones with a space and leaves unknown ones', () => {
    expect(fillTemplate('היי {name}, {shift time} ב{place} {x}', { name: 'דנה', 'shift time': '08:30', place: 'ירושלים' }))
      .toBe('היי דנה, 08:30 בירושלים {x}')
  })

  it('normalises Israeli phone numbers for wa.me', () => {
    expect(toWaNumber('050-123-4567')).toBe('972501234567')
    expect(toWaNumber('+972501234567')).toBe('972501234567')
    expect(toWaNumber('972501234567')).toBe('972501234567')
    expect(waUrl('0501234567', 'שלום')).toBe('https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D')
  })

  it('derives the reply state', () => {
    expect(replyState(undefined)).toBe('none')
    expect(replyState({ sentAt: 1 })).toBe('sent')
    expect(replyState({ sentAt: 1, openedAt: 2 })).toBe('opened')
    expect(replyState({ status: 'answered', sentAt: 1 })).toBe('answered')
    expect(replyState({ status: 'declined' })).toBe('declined')
    expect(isMissingReply('opened')).toBe(true)
    expect(isMissingReply('answered')).toBe(false)
  })

  it('computes tomorrow across a month boundary', () => {
    expect(tomorrowISO(new Date(2026, 11, 31))).toBe('2027-01-01')
  })

  it('builds a report with missing slots, no-shows and who did not answer', () => {
    const text = buildReport({
      branchName: 'ירושלים', month: '2026-12',
      shifts: [{ id: 's1', date: '2026-12-02', startTime: '08:30', endTime: '11:00', location: 'מחסן', capacity: 4, status: 'open' }],
      assignments: [
        { shiftId: 's1', volunteerId: 'a', status: 'attended' },
        { shiftId: 's1', volunteerId: 'b', status: 'no_show' },
        { shiftId: 's1', volunteerId: 'c', status: 'cancelled' },
      ],
      volunteers: [
        { id: 'a', name: 'אבי', status: 'active', optOut: false },
        { id: 'b', name: 'בני', status: 'active', optOut: false },
        { id: 'c', name: 'גלית', status: 'active', optOut: false },
      ],
      responses: [{ volunteerId: 'a', status: 'answered' }, { volunteerId: 'c', status: 'declined' }],
    })
    expect(text).toContain('רשומים 2/4 · חסרים 2')
    expect(text).toContain('לא הגיעו: בני')
    expect(text).toContain('לא ענו: בני')
    expect(text).toContain('סירבו: גלית')
  })
})
