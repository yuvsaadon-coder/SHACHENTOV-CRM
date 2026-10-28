import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore'
import type { QuarterLabel, QuarterlyReport } from '../types'

export type ReportFieldValue = string | { rating: string; notes: string }
export type ReportData = Record<string, ReportFieldValue>

export interface ReportPeriod {
  branchId: string
  year: number
  quarter: QuarterLabel
}

export interface ReportDraft {
  values: ReportData
}

export interface QuarterlyReportSubmission extends ReportPeriod {
  branchType: 'food' | 'cafe_youth'
  submittedBy: string
  isFirstReport: boolean
  data: ReportData
}

export class ReportAlreadySubmittedError extends Error {
  constructor() {
    super('A quarterly report already exists for this branch and period.')
    this.name = 'ReportAlreadySubmittedError'
  }
}

export function quarterlyReportId({ branchId, year, quarter }: ReportPeriod): string {
  return `${branchId}_${year}_${quarter}`
}

export function reportDraftKey({ branchId, year, quarter }: ReportPeriod): string {
  return `report_draft_${branchId}_${year}_${quarter}`
}

const legacyReportDraftKey = (branchId: string) => `report_draft_${branchId}`

function parseDraft(raw: string | null): ReportDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { values?: unknown }
    if (!parsed.values || typeof parsed.values !== 'object' || Array.isArray(parsed.values)) return null
    return { values: parsed.values as ReportData }
  } catch {
    return null
  }
}

/**
 * Reads the period-scoped draft. The legacy branch-only key is migrated only
 * when its embedded period matches, preventing old drafts from leaking.
 */
export function loadReportDraft(storage: Storage, period: ReportPeriod): ReportDraft | null {
  const key = reportDraftKey(period)
  const scoped = parseDraft(storage.getItem(key))
  if (scoped) return scoped

  const legacyKey = legacyReportDraftKey(period.branchId)
  const legacyRaw = storage.getItem(legacyKey)
  if (!legacyRaw) return null
  try {
    const legacy = JSON.parse(legacyRaw) as {
      quarter?: unknown
      year?: unknown
      values?: unknown
    }
    if (
      legacy.quarter !== period.quarter
      || legacy.year !== period.year
      || !legacy.values
      || typeof legacy.values !== 'object'
      || Array.isArray(legacy.values)
    ) {
      return null
    }
    const migrated = { values: legacy.values as ReportData }
    storage.setItem(key, JSON.stringify(migrated))
    storage.removeItem(legacyKey)
    return migrated
  } catch {
    return null
  }
}

export function saveReportDraft(storage: Storage, period: ReportPeriod, values: ReportData): void {
  storage.setItem(reportDraftKey(period), JSON.stringify({ values }))
}

export function deleteReportDraft(
  storage: Storage,
  period: ReportPeriod,
  cancelPendingSave?: () => void,
): void {
  cancelPendingSave?.()
  storage.removeItem(reportDraftKey(period))
}

export interface AtomicReportStore {
  create(id: string, submission: QuarterlyReportSubmission): Promise<boolean>
}

export function firestoreQuarterlyReportStore(firestore: Firestore): AtomicReportStore {
  return {
    create: (id, submission) => runTransaction(firestore, async (transaction) => {
      const reportRef = doc(firestore, 'quarterlyReports', id)
      const existing = await transaction.get(reportRef)
      if (existing.exists()) return false
      transaction.set(reportRef, {
        ...submission,
        submittedAt: serverTimestamp(),
      })
      return true
    }),
  }
}

export async function submitQuarterlyReport(
  store: AtomicReportStore,
  submission: QuarterlyReportSubmission,
): Promise<string> {
  const id = quarterlyReportId(submission)
  if (!await store.create(id, submission)) throw new ReportAlreadySubmittedError()
  return id
}

function timestampMillis(value: Timestamp | undefined): number {
  return value?.toMillis?.() ?? 0
}

/**
 * Historical random-ID reports remain readable. If historical duplicates
 * exist, prefer the canonical deterministic document, then the newest record.
 */
export function normalizeQuarterlyReports(reports: QuarterlyReport[]): QuarterlyReport[] {
  const byPeriod = new Map<string, QuarterlyReport>()
  for (const report of reports) {
    const key = quarterlyReportId(report)
    const current = byPeriod.get(key)
    if (
      !current
      || report.id === key
      || (current.id !== key && timestampMillis(report.submittedAt) > timestampMillis(current.submittedAt))
    ) {
      byPeriod.set(key, report)
    }
  }
  return [...byPeriod.values()]
}
