import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useQuarterlyReports } from '../../hooks/useQuarterlyReports'
import { useAllReportQuestions } from '../../hooks/useReportQuestions'
import { useBranchSuppliers } from '../../hooks/useBranchSuppliers'
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
  const { suppliers, partners, loading: supLoading, error: supError } = useBranchSuppliers(branch.id)

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
        <a
          href="https://forms.gle/3aFj7M15jnbMPh347"
          target="_blank"
          rel="noopener noreferrer"
          className="col-span-2 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
        >
          <span className="text-3xl">💸</span>
          <span className="text-sm font-medium" style={{ color: '#141348' }}>טופס בקשה להחזר הוצאות</span>
        </a>
      </div>

      {/* Suppliers & partners of this branch */}
      <div>
        <h2 className="font-bold mb-3" style={{ color: '#141348' }}>הספקים והשותפים של הסניף</h2>
        {supLoading ? (
          <div className="text-sm text-gray-400 text-center py-3">טוען...</div>
        ) : supError ? (
          <div className="bg-white rounded-xl p-4 text-center text-sm text-gray-400 border border-gray-100">לא ניתן לטעון את הספקים כרגע</div>
        ) : suppliers.length === 0 && partners.length === 0 ? (
          <div className="bg-white rounded-xl p-4 text-center text-sm text-gray-400 border border-gray-100">עדיין לא שויכו ספקים לסניף</div>
        ) : (
          <div className="space-y-2">
            {suppliers.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span>🚚</span>
                  <span className="font-medium" style={{ color: '#141348' }}>{s.name}</span>
                </div>
                {s.categories.length > 0 && <div className="text-xs text-gray-400 mt-0.5">{s.categories.join(', ')}</div>}
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                  {s.contactName && <span className="text-gray-500">👤 {s.contactName}</span>}
                  {s.phone && <a href={`tel:${s.phone}`} className="text-[#189A9F]" dir="ltr">📞 {s.phone}</a>}
                  {s.email && <a href={`mailto:${s.email}`} className="text-[#189A9F]" dir="ltr">✉️ {s.email}</a>}
                  {s.websiteUrl && <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-[#189A9F]">🌐 אתר</a>}
                </div>
              </div>
            ))}
            {partners.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 text-sm flex items-center gap-2">
                <span>🤝</span>
                <span className="font-medium" style={{ color: '#141348' }}>{p.name}</span>
                {p.websiteUrl && <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="mr-auto text-xs text-[#189A9F]">🌐 אתר</a>}
              </div>
            ))}
          </div>
        )}
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
