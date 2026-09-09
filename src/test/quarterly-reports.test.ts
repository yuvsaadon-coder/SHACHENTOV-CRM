import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteReportDraft,
  loadReportDraft,
  reportDraftKey,
  saveReportDraft,
  submitQuarterlyReport,
  type AtomicReportStore,
  type QuarterlyReportSubmission,
} from '../lib/quarterlyReports'
import { serializeQuarterlyReport } from '../../netlify/functions/hq-chat-reports'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

const submission: QuarterlyReportSubmission = {
  branchId: 'branch-1',
  branchType: 'food',
  quarter: 'Q3',
  year: 2026,
  submittedBy: 'coordinator-1',
  isFirstReport: false,
  data: { participants: '42' },
}

describe('quarterly report integrity', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows only one concurrent submission for a natural report identity', async () => {
    const ids = new Set<string>()
    const store: AtomicReportStore = {
      async create(id) {
        if (ids.has(id)) return false
        ids.add(id)
        return true
      },
    }

    const results = await Promise.allSettled([
      submitQuarterlyReport(store, submission),
      submitQuarterlyReport(store, submission),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(ids).toEqual(new Set(['branch-1_2026_Q3']))
  })

  it('keeps drafts isolated when switching periods', () => {
    const q2 = { branchId: 'branch-1', year: 2026, quarter: 'Q2' as const }
    const q3 = { branchId: 'branch-1', year: 2026, quarter: 'Q3' as const }
    saveReportDraft(storage, q2, { participants: '12' })
    saveReportDraft(storage, q3, { participants: '27' })

    expect(loadReportDraft(storage, q2)?.values.participants).toBe('12')
    expect(loadReportDraft(storage, q3)?.values.participants).toBe('27')
    expect(reportDraftKey(q2)).not.toBe(reportDraftKey(q3))
  })

  it('migrates a matching legacy branch draft to its period key', () => {
    const period = { branchId: 'branch-1', year: 2025, quarter: 'Q4' as const }
    storage.setItem('report_draft_branch-1', JSON.stringify({
      year: 2025,
      quarter: 'Q4',
      values: { participants: '18' },
    }))

    expect(loadReportDraft(storage, period)?.values.participants).toBe('18')
    expect(storage.getItem('report_draft_branch-1')).toBeNull()
    expect(storage.getItem(reportDraftKey(period))).not.toBeNull()
  })

  it('does not recreate a deleted draft after pending autosave is cancelled', () => {
    const period = { branchId: 'branch-1', year: 2026, quarter: 'Q3' as const }
    const pendingSave = setTimeout(
      () => saveReportDraft(storage, period, { participants: '99' }),
      500,
    )

    deleteReportDraft(storage, period, () => clearTimeout(pendingSave))
    vi.advanceTimersByTime(500)

    expect(storage.getItem(reportDraftKey(period))).toBeNull()
  })

  it('serializes submitted data answers into chatbot context', () => {
    const context = serializeQuarterlyReport({
      branchId: 'branch-1',
      quarter: 'Q3',
      year: 2026,
      data: {
        participants: '42',
        supplier: { rating: '5', notes: 'שירות מצוין' },
      },
    })

    expect(context).toContain('participants: 42')
    expect(context).toContain('דירוג: 5')
    expect(context).toContain('הערות: שירות מצוין')
  })
})
