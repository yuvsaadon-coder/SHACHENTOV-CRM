import { describe, expect, it } from 'vitest'
import {
  branchRecord, buildRecordsContext, catalogRecord, dateStr, flatten, partnerRecord, recordsAsDocs, reportRecord, taskRecord, userRecord,
  volunteerAggregates, votingRecords, type Lookups, type SnapshotRecord,
} from '../../netlify/functions/_records'
import { queryTokens, rankChunks } from '../../netlify/functions/_retrieval'

const lk: Lookups = {
  branchName: (id) => ({ b1: 'בית שמש', b2: 'נחלאות' }[id] ?? id),
  roleTitle: (id) => ({ r1: 'רכזת בית שמש' }[id] ?? id),
  holdersOf: (id) => (id === 'r1' ? ['דנה'] : []),
  contactName: (id) => ({ c1: 'אילן' }[id] ?? ''),
}

describe('record formatters', () => {
  it('formats dates from Firestore timestamps, strings and numbers', () => {
    expect(dateStr({ toDate: () => new Date('2026-05-01T00:00:00Z') })).toBe('2026-05-01')
    expect(dateStr({ seconds: 1777593600 })).toMatch(/^2026-/)
    expect(dateStr('2026-12-01T10:00:00Z')).toBe('2026-12-01')
    expect(dateStr(null)).toBe('')
  })

  it('writes a task with its dates, holiday and attachment count', () => {
    const r = taskRecord('JLM-07', { title: 'פסח: איסוף זמנים', domain: 'JLM', frequency: 'לפי חג', startDate: '2027-03-01', endDate: '2027-03-15', holidayAnchor: 'פסח', status: 'לא בוצע', attachmentCount: 8 })
    expect(r.text).toContain('[משימה JLM-07]')
    expect(r.text).toContain('תחום: סניפי ירושלים')
    expect(r.text).toContain('תאריכים: 2027-03-01 עד 2027-03-15')
    expect(r.text).toContain('קבצים מצורפים: 8')
  })

  it('writes people with position titles and branch names, and branches with their operations', () => {
    const u = userRecord('u1', { name: 'דנה', role: 'coordinator', email: 'd@x.org', phone: '0501234567', roleIds: ['r1'], branchIds: ['b1'] }, lk)
    expect(u.core).toBe(true)
    expect(u.text).toContain('הרשאה: רכז/ת סניף')
    expect(u.text).toContain('תפקידים: רכזת בית שמש')
    expect(u.text).toContain('סניפי פורטל: בית שמש')
    const b = branchRecord('b1', { name: 'בית שמש', city: 'בית שמש', type: 'food', distributionFrequency: 'שבועי', weeklyBaskets: 120 })
    expect(b.text).toContain('סלים בשבוע: 120')
  })

  it('resolves contacts and branches of partners', () => {
    const p = partnerRecord('p1', { name: 'JGive', partnerType: 'payment', status: 'active', paymentMethods: ['credit', 'bit'], branchIds: ['b1'], contactIds: ['c1'], files: [{ name: 'הסכם.pdf' }] }, lk)
    expect(p.text).toContain('אמצעי תשלום: אשראי, ביט')
    expect(p.text).toContain('סניפים: בית שמש')
    expect(p.text).toContain('אנשי קשר: אילן')
    expect(p.text).toContain('קבצים: הסכם.pdf')
  })

  it('labels the answers of a quarterly report with the question text', () => {
    const r = reportRecord('q1', { branchId: 'b2', quarter: 'Q3', year: 2026, data: { families: 40, supplier_x: { rating: '4', notes: 'טוב' } } }, { families: 'כמה משפחות' }, lk)
    expect(r.text).toContain('נחלאות')
    expect(r.text).toContain('כמה משפחות: 40')
    expect(r.text).toContain('supplier_x: דירוג 4/5 — טוב')
  })
})

describe('what must never reach the model', () => {
  it('flatten drops anything that looks like a password, token or secret', () => {
    const out = flatten({ name: 'x', password: 'p', apiToken: 't', nested: { secretKey: 's', ok: 1 } })
    expect(out).toContain('name: x')
    expect(out).not.toMatch(/password|apiToken|secretKey|: p\b|: t\b/)
  })

  it('volunteer summaries are counts only — no names or phones', () => {
    const recs = volunteerAggregates({
      members: [{ branchIds: ['b1'], status: 'active', name: 'יוסי כהן', phone: '+972501112222' } as never, { branchIds: ['b1'], status: 'inactive' }],
      shifts: [{ id: 's1', branchId: 'b1', month: '2026-12', capacity: 5, status: 'open' }],
      assignments: [{ branchId: 'b1', status: 'committed', shiftId: 's1' }],
      responses: [{ branchId: 'b1', month: '2026-12', status: 'answered', sentAt: 1 }],
    }, lk)
    expect(recs).toHaveLength(1)
    expect(recs[0].text).toContain('מתנדבים רשומים: 2 (פעילים: 1)')
    expect(recs[0].text).toContain('משמרות 1 (קיבולת 5)')
    expect(recs[0].text).toContain('שיבוצים: התחייבו 1')
    expect(recs[0].text).not.toMatch(/יוסי|972|050/)
  })
})

describe('voting records', () => {
  it('summarises products, baskets, round and branch settings', () => {
    const recs = votingRecords(
      { products: [{ id: 'p1', name: 'אורז', price: 8.5, max: 3, cat: 'יבשים', active: false }], baskets: [{ id: 'a', name: 'סל א', budget: 120 }], round: { num: 4, open: true } },
      [{ id: 'r3', data: { num: 3 } }], [], [{ id: 'b1', data: { votesIn: 'holidays', familiesRoutine: 90 } }], lk,
    )
    const text = recs.map((r) => r.text).join('\n')
    expect(text).toContain('אורז')
    expect(text).toContain('פעיל בסקר: לא (מוסתר)')
    expect(text).toContain('סל א: תקציב 120')
    expect(text).toContain('פתוח להצבעה: כן')
    expect(text).toContain('הצבעה: מצביע בחגים בלבד')
  })
})

describe('budget selection', () => {
  const rec = (type: string, id: string, text: string, core = false): SnapshotRecord => ({ type, id, title: id, text, core })

  it('always keeps core records and fills the rest by relevance within the budget', () => {
    const core = [rec('סניף', 'b1', '[סניף בית שמש] סלים בשבוע: 120', true), catalogRecord({ משימות: 3 }, { byStatus: { בוצע: 1 }, byDomain: { JLM: 3 } })]
    const rest = [
      rec('משימה', 't1', '[משימה JLM-07] פסח איסוף זמנים'),
      rec('משימה', 't2', '[משימה DES-01] עיצוב גלויות לחנוכה'),
      rec('ספק', 's1', '[ספק ביצי אביב] ביצים'),
    ]
    const ranked = rankChunks(recordsAsDocs(rest), queryTokens('מה המשימות של פסח'))
    const ctx = buildRecordsContext(core, ranked, 400)
    expect(ctx.coreText).toContain('בית שמש')
    expect(ctx.recordsText).toContain('JLM-07')
    expect(ctx.recordsText).not.toContain('ביצי אביב')
  })

  it('counts what did not fit', () => {
    const rest = Array.from({ length: 20 }, (_, i) => rec('משימה', `t${i}`, `[משימה ${i}] ירושלים חלוקה ${'מילים '.repeat(40)}`))
    const ranked = rankChunks(recordsAsDocs(rest), queryTokens('חלוקה בירושלים'))
    const ctx = buildRecordsContext([], ranked, 1000)
    expect(ctx.recordsChars).toBeLessThanOrEqual(1000)
    expect(ctx.omitted).toBeGreaterThan(0)
  })
})
