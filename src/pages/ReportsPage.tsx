import { useMemo, useState } from 'react'
import { useAllQuarterlyReports } from '../hooks/useAllQuarterlyReports'
import { useAllBranches } from '../hooks/useBranch'
import { useAllReportQuestions } from '../hooks/useReportQuestions'
import { QUARTERS, QUARTER_LABELS, type QuarterLabel } from '../types'
import type { QuarterlyReport, Branch } from '../types'
import { Spinner } from '../components/ui/Spinner'

/** Supplier fields are stored as `{ rating, notes }`. */
function isRating(v: unknown): v is { rating?: string; notes?: string } {
  return typeof v === 'object' && v !== null && ('rating' in v || 'notes' in v)
}

function ratingOf(v: unknown): number | null {
  if (!isRating(v)) return null
  const n = Number(v.rating)
  return Number.isFinite(n) && n > 0 ? n : null
}

function FieldValue({ value }: { value: unknown }) {
  if (isRating(value)) {
    const rating = value.rating?.trim()
    const notes = value.notes?.trim()
    if (!rating && !notes) return <span className="text-gray-400">—</span>
    return (
      <span>
        {rating && (
          <span className="inline-flex items-center gap-1">
            <span className="font-medium" style={{ color: '#141348' }}>{rating}/5</span>
            <span style={{ color: '#189A9F' }}>{'★'.repeat(Number(rating) || 0)}</span>
          </span>
        )}
        {notes && <span className="block text-gray-600 mt-0.5">{notes}</span>}
      </span>
    )
  }
  const text = String(value ?? '').trim()
  return text ? <span>{text}</span> : <span className="text-gray-400">—</span>
}

function ReportCard({ report, branch, labelByKey }: { report: QuarterlyReport; branch?: Branch; labelByKey: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const date = report.submittedAt?.toDate?.().toLocaleDateString('he-IL') ?? ''

  // Average of whatever supplier ratings this report actually filled in.
  const ratings = Object.values(report.data).map(ratingOf).filter((n): n is number => n !== null)
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-right"
      >
        <div className="min-w-0">
          <div className="font-medium text-sm truncate" style={{ color: '#141348' }}>
            {branch?.name ?? report.branchId}
          </div>
          <div className="text-xs text-gray-400">
            {QUARTER_LABELS[report.quarter]} {report.year}
            {date && ` · הוגש ${date}`}
            {report.isFirstReport && ' · דיווח ראשון'}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {avg !== null && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: avg >= 4 ? '#C6EFCE' : avg >= 3 ? '#FDC857' : '#FEE2E2',
                color: avg >= 4 ? '#0A6B2E' : avg >= 3 ? '#7A5A00' : '#B91C1C',
              }}
            >
              ספקים {avg.toFixed(1)}
            </span>
          )}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 bg-gray-50 space-y-2 border-t border-gray-100">
          {Object.entries(report.data).map(([k, v]) => (
            <div key={k} className="flex gap-3 text-sm items-start">
              <span className="text-gray-500 shrink-0 w-40 leading-relaxed">{labelByKey[k] ?? k}:</span>
              <span className="flex-1 min-w-0 break-words leading-relaxed" style={{ color: '#141348' }}>
                <FieldValue value={v} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const BRANCH_TYPE_LABELS: Record<string, string> = {
  food: 'סלי מזון',
  cafe_youth: 'בתי קפה ומועדוני נוער',
}

type PageTab = 'reports' | 'coverage'

export function ReportsPage() {
  const { reports, loading, error } = useAllQuarterlyReports()
  const { branches } = useAllBranches()
  const { labelByKey } = useAllReportQuestions()

  const [tab, setTab] = useState<PageTab>('reports')
  const [branchId, setBranchId] = useState('')
  const [quarter, setQuarter] = useState<QuarterLabel | ''>('')
  const [year, setYear] = useState<number | ''>('')
  const [branchType, setBranchType] = useState('')
  const [city, setCity] = useState('')
  const [search, setSearch] = useState('')

  // Coverage tab state
  const currentYear = new Date().getFullYear()
  const [covQuarter, setCovQuarter] = useState<QuarterLabel>('Q1')
  const [covYear, setCovYear] = useState<number>(currentYear)

  const branchMap = useMemo(
    () => Object.fromEntries(branches.map((b) => [b.id, b])),
    [branches]
  )
  const years = useMemo(
    () => [...new Set(reports.map((r) => r.year))].sort((a, b) => b - a),
    [reports]
  )
  const cities = useMemo(
    () => [...new Set(branches.map((b) => b.city).filter(Boolean))].sort(),
    [branches]
  )

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return reports.filter((r) => {
      const branch = branchMap[r.branchId]
      if (branchId && r.branchId !== branchId) return false
      if (quarter && r.quarter !== quarter) return false
      if (year !== '' && r.year !== year) return false
      if (branchType && r.branchType !== branchType) return false
      if (city && branch?.city !== city) return false
      if (needle) {
        const hay = [
          branch?.name ?? '',
          branch?.city ?? '',
          ...Object.values(r.data).map((v) =>
            isRating(v) ? `${v.rating ?? ''} ${v.notes ?? ''}` : String(v ?? '')
          ),
        ].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [reports, branchMap, branchId, quarter, year, branchType, city, search])

  const activeFilters = [branchId, quarter, year !== '' ? String(year) : '', branchType, city, search]
    .filter(Boolean).length

  const clearAll = () => {
    setBranchId(''); setQuarter(''); setYear(''); setBranchType(''); setCity(''); setSearch('')
  }

  // Coverage: which branches reported for covQuarter/covYear
  const covReportedIds = useMemo(() => {
    return new Set(
      reports
        .filter((r) => r.quarter === covQuarter && r.year === covYear)
        .map((r) => r.branchId)
    )
  }, [reports, covQuarter, covYear])

  const covReported = useMemo(() => branches.filter((b) => covReportedIds.has(b.id)), [branches, covReportedIds])
  const covMissing = useMemo(() => branches.filter((b) => !covReportedIds.has(b.id)), [branches, covReportedIds])

  const exportCsv = () => {
    const keys = [...new Set(filtered.flatMap((r) => Object.keys(r.data)))]
    const header = ['סניף', 'עיר', 'סוג', 'רבעון', 'שנה', 'תאריך הגשה', ...keys.map((k) => labelByKey[k] ?? k)]
    const rows = filtered.map((r) => {
      const b = branchMap[r.branchId]
      return [
        b?.name ?? r.branchId,
        b?.city ?? '',
        BRANCH_TYPE_LABELS[r.branchType] ?? r.branchType,
        QUARTER_LABELS[r.quarter],
        String(r.year),
        r.submittedAt?.toDate?.().toLocaleDateString('he-IL') ?? '',
        ...keys.map((k) => {
          const v = r.data[k]
          if (isRating(v)) return [v.rating, v.notes].filter(Boolean).join(' — ')
          return String(v ?? '')
        }),
      ]
    })
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `דיווחים-רבעוניים-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectClass =
    'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#189A9F]'

  if (loading) return <Spinner />

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>דיווחים רבעוניים</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} מתוך {reports.length} דיווחים מכלל הסניפים
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40"
          style={{ backgroundColor: '#141348' }}
        >
          ייצוא ל-CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          שגיאה בטעינת הדיווחים: {error}
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['reports', '📄 דיווחים'], ['coverage', '📊 כיסוי רבעוני']] as [PageTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === key
              ? { backgroundColor: 'white', color: '#141348', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
              : { color: '#6B7280' }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'reports' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: '#141348' }}>סינון</h2>
              {activeFilters > 0 && (
                <button onClick={clearAll} className="text-xs text-gray-500 hover:text-red-500">
                  נקה סינון ({activeFilters})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectClass}>
                <option value="">כל הסניפים</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              <select value={city} onChange={(e) => setCity(e.target.value)} className={selectClass}>
                <option value="">כל הערים</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <select value={branchType} onChange={(e) => setBranchType(e.target.value)} className={selectClass}>
                <option value="">כל סוגי הסניפים</option>
                {Object.entries(BRANCH_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>

              <select
                value={quarter}
                onChange={(e) => setQuarter(e.target.value as QuarterLabel | '')}
                className={selectClass}
              >
                <option value="">כל הרבעונים</option>
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>{QUARTER_LABELS[q]}</option>
                ))}
              </select>

              <select
                value={year}
                onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
                className={selectClass}
              >
                <option value="">כל השנים</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש חופשי בתוכן הדיווחים..."
                className={selectClass}
              />
            </div>
          </div>

          {/* Results */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
              {reports.length === 0 ? 'עדיין לא הוגשו דיווחים רבעוניים' : 'אין דיווחים התואמים את הסינון'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <ReportCard key={r.id} report={r} branch={branchMap[r.branchId]} labelByKey={labelByKey} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'coverage' && (
        <div className="space-y-4">
          {/* Quarter/Year picker */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-semibold" style={{ color: '#141348' }}>בחר רבעון:</span>
            <select
              value={covQuarter}
              onChange={(e) => setCovQuarter(e.target.value as QuarterLabel)}
              className={selectClass}
            >
              {QUARTERS.map((q) => (
                <option key={q} value={q}>{QUARTER_LABELS[q]}</option>
              ))}
            </select>
            <select
              value={covYear}
              onChange={(e) => setCovYear(Number(e.target.value))}
              className={selectClass}
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
              {covReported.length} מתוך {branches.length} סניפים דיווחו
            </span>
          </div>

          {/* Coverage bars */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex gap-2 mb-3 text-xs text-gray-500 items-center">
              <span className="w-3 h-3 rounded-full bg-green-400 inline-block"></span> דיווחו ({covReported.length})
              <span className="w-3 h-3 rounded-full bg-red-300 inline-block mr-2"></span> לא דיווחו ({covMissing.length})
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
              <div
                className="bg-green-400 h-full rounded-full transition-all"
                style={{ width: branches.length > 0 ? `${Math.round(covReported.length / branches.length * 100)}%` : '0%' }}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Did NOT report */}
              <div>
                <h3 className="text-sm font-semibold text-red-600 mb-2">
                  🔴 לא דיווחו ({covMissing.length})
                </h3>
                {covMissing.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 text-center">כל הסניפים דיווחו!</div>
                ) : (
                  <div className="space-y-1">
                    {covMissing.map((b) => (
                      <div key={b.id} className="flex items-center justify-between px-3 py-2 bg-red-50 rounded-lg border border-red-100 text-sm">
                        <span className="font-medium text-gray-800">{b.name}</span>
                        <span className="text-xs text-gray-500">{b.city}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reported */}
              <div>
                <h3 className="text-sm font-semibold text-green-700 mb-2">
                  🟢 דיווחו ({covReported.length})
                </h3>
                {covReported.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 text-center">אין דיווחים עדיין לרבעון זה</div>
                ) : (
                  <div className="space-y-1">
                    {covReported.map((b) => {
                      const rep = reports.find((r) => r.branchId === b.id && r.quarter === covQuarter && r.year === covYear)
                      return (
                        <div key={b.id} className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-lg border border-green-100 text-sm">
                          <span className="font-medium text-gray-800">{b.name}</span>
                          <span className="text-xs text-gray-500">
                            {rep?.submittedAt?.toDate?.().toLocaleDateString('he-IL') ?? b.city}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
