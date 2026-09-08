import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useQuarterlyReports } from '../../hooks/useQuarterlyReports'
import { useAllReportQuestions } from '../../hooks/useReportQuestions'
import type { PortalOutletContext } from './CoordinatorPortal'
import type { QuarterlyReport } from '../../types'
import { QUARTER_LABELS } from '../../types'

/** Supplier fields are stored as `{ rating, notes }` — render them, never JSON.stringify. */
function isRating(v: unknown): v is { rating?: string; notes?: string } {
  return typeof v === 'object' && v !== null && ('rating' in v || 'notes' in v)
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
        {notes && (
          <span className="block text-gray-600 mt-0.5">{notes}</span>
        )}
      </span>
    )
  }
  const text = String(value ?? '').trim()
  return text ? <span>{text}</span> : <span className="text-gray-400">—</span>
}

function ReportAccordion({ report, labelByKey }: { report: QuarterlyReport; labelByKey: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const title = `${QUARTER_LABELS[report.quarter]} ${report.year}`
  const date = report.submittedAt?.toDate?.().toLocaleDateString('he-IL') ?? ''

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-right"
      >
        <div>
          <div className="font-medium text-sm" style={{ color: '#141348' }}>{title}</div>
          {date && <div className="text-xs text-gray-400">{date}</div>}
        </div>
        <span className="text-gray-400 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-gray-50 space-y-2 border-t border-gray-100">
          {Object.entries(report.data).map(([k, v]) => (
            <div key={k} className="flex gap-3 text-sm items-start">
              <span className="text-gray-500 shrink-0 w-36 leading-relaxed">{labelByKey[k] ?? k}:</span>
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

export function PortalHome() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const { reports } = useQuarterlyReports(branch.id)
  const { labelByKey } = useAllReportQuestions()

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto">
      {/* Welcome card */}
      <div
        className="rounded-2xl p-5 text-white shadow-sm"
        style={{ background: 'linear-gradient(135deg, #141348 0%, #189A9F 100%)' }}
      >
        <div className="text-xs opacity-70 mb-1">ברוכים הבאים</div>
        <div className="text-xl font-bold">{branch.name}</div>
        <div className="text-xs opacity-60 mt-1">{branch.city}</div>
      </div>

      {/* Navigation grid */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/portal/report"
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-3xl">📋</span>
          <span className="text-sm font-medium" style={{ color: '#141348' }}>מלא דיווח רבעוני</span>
        </Link>
        <Link
          to="/portal/knowledge"
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-3xl">📚</span>
          <span className="text-sm font-medium" style={{ color: '#141348' }}>מאגר הידע</span>
        </Link>
        <Link
          to="/portal/chat"
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-3xl">🤖</span>
          <span className="text-sm font-medium" style={{ color: '#141348' }}>צ'אטבוט AI</span>
        </Link>
        <button
          onClick={() => document.getElementById('my-reports')?.scrollIntoView({ behavior: 'smooth' })}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-3xl">📊</span>
          <span className="text-sm font-medium" style={{ color: '#141348' }}>הדיווחים שלי</span>
        </button>
      </div>

      {/* My reports */}
      <div id="my-reports">
        <h2 className="font-bold mb-3" style={{ color: '#141348' }}>הדיווחים שלי ({reports.length})</h2>
        {reports.length === 0 ? (
          <div className="bg-white rounded-xl p-4 text-center text-sm text-gray-400 border border-gray-100">
            עדיין לא הגשת דיווחים
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <ReportAccordion key={r.id} report={r} labelByKey={labelByKey} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
