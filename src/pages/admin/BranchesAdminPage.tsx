import { useState, useMemo } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAllBranches } from '../../hooks/useBranch'
import { useQuarterlyReports } from '../../hooks/useQuarterlyReports'
import { Spinner } from '../../components/ui/Spinner'
import { QUARTER_LABELS, QUARTERS, type Branch, type QuarterLabel, type QuarterlyReport } from '../../types'

function currentQuarter(): QuarterLabel {
  return QUARTERS[Math.floor(new Date().getMonth() / 3)]
}

function SupplierChart({ reports }: { reports: QuarterlyReport[] }) {
  const points = useMemo(() => {
    return reports
      .filter((r) => r.branchType === 'food')
      .map((r) => {
        const ratings = ['f2', 'f3', 'f4', 'f5', 'f6', 'f7']
          .map((k) => {
            const v = r.data[k] as { rating?: string } | undefined
            return v?.rating ? +v.rating : null
          })
          .filter((n): n is number => n !== null)
        const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
        return { label: `${r.quarter} ${r.year}`, avg }
      })
      .filter((p) => p.avg !== null)
      .reverse()
  }, [reports])

  if (points.length < 2) return null

  const W = 300; const H = 80; const PAD = 20
  const maxY = 5; const minY = 1
  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2))
  const ys = points.map((p) => H - PAD - ((p.avg! - minY) / (maxY - minY)) * (H - PAD * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ')

  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-gray-500 mb-2">ממוצע דירוגי ספקים לאורך רבעונים</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        <path d={d} fill="none" stroke="#189A9F" strokeWidth="2" />
        {xs.map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={ys[i]} r="3" fill="#189A9F" />
            <text x={x} y={H} textAnchor="middle" fontSize="8" fill="#9CA3AF">{points[i].label}</text>
            <text x={x} y={ys[i] - 6} textAnchor="middle" fontSize="8" fill="#189A9F">
              {points[i].avg!.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function ParticipantChart({ reports }: { reports: QuarterlyReport[] }) {
  const points = useMemo(() => {
    return reports
      .filter((r) => r.branchType === 'cafe_youth')
      .map((r) => ({
        label: `${r.quarter} ${r.year}`,
        count: r.data.c1 ? +String(r.data.c1) : null,
      }))
      .filter((p) => p.count !== null)
      .reverse()
  }, [reports])

  if (points.length < 2) return null

  const W = 300; const H = 80; const PAD = 20
  const maxY = Math.max(...points.map((p) => p.count!), 1)
  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2))
  const ys = points.map((p) => H - PAD - (p.count! / maxY) * (H - PAD * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ')

  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-gray-500 mb-2">כמות משתתפים ממוצעת לאורך רבעונים</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        <path d={d} fill="none" stroke="#FDC857" strokeWidth="2" />
        {xs.map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={ys[i]} r="3" fill="#FDC857" />
            <text x={x} y={H} textAnchor="middle" fontSize="8" fill="#9CA3AF">{points[i].label}</text>
            <text x={x} y={ys[i] - 6} textAnchor="middle" fontSize="8" fill="#7A5A00">
              {points[i].count}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function BranchReportAccordion({ report }: { report: QuarterlyReport }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 text-right"
      >
        <div>
          <span className="text-sm font-medium" style={{ color: '#141348' }}>
            {QUARTER_LABELS[report.quarter]} {report.year}
          </span>
          <span className="text-xs text-gray-400 mr-2">
            {report.submittedAt?.toDate?.().toLocaleDateString('he-IL')}
          </span>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs space-y-1">
          {Object.entries(report.data).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-gray-500 shrink-0 w-32">{k}:</span>
              <span style={{ color: '#141348' }}>
                {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BranchDetail({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const { reports, loading } = useQuarterlyReports(branch.id)
  const q = currentQuarter()
  const thisQuarter = reports.find((r) => r.quarter === q && r.year === new Date().getFullYear())

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#141348' }}>{branch.name}</h2>
            <p className="text-xs text-gray-500">{branch.city} · {branch.type === 'food' ? 'מזון' : 'בית קפה / נוער'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status */}
          <div>
            <span className="text-xs text-gray-500">סטטוס רבעון נוכחי ({q} {new Date().getFullYear()}): </span>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={thisQuarter
                ? { backgroundColor: '#C6EFCE', color: '#0A6B2E' }
                : { backgroundColor: '#FEE2E2', color: '#B91C1C' }
              }
            >
              {thisQuarter ? 'דווח' : 'לא דווח'}
            </span>
          </div>

          {/* Reminder button */}
          <a
            href={`mailto:${branch.coordinatorUids.join(',')}?subject=תזכורת דיווח רבעוני — ${branch.name}&body=שלום,\nתזכורת להגשת הדיווח הרבעוני עבור ${branch.name}.`}
            className="inline-block px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            style={{ color: '#141348' }}
          >
            📧 שלח תזכורת
          </a>

          {/* Charts */}
          {!loading && reports.length > 1 && (
            branch.type === 'food'
              ? <SupplierChart reports={reports} />
              : <ParticipantChart reports={reports} />
          )}

          {/* Reports history */}
          <div>
            <h3 className="font-bold text-sm mb-3" style={{ color: '#141348' }}>היסטוריית דיווחים ({reports.length})</h3>
            {loading ? (
              <p className="text-sm text-gray-400">טוען...</p>
            ) : reports.length === 0 ? (
              <p className="text-sm text-gray-400">אין דיווחים עדיין</p>
            ) : (
              <div className="space-y-2">
                {reports.map((r) => <BranchReportAccordion key={r.id} report={r} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AddBranchModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [type, setType] = useState<'food' | 'cafe_youth'>('food')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !city.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'branches'), {
        name: name.trim(),
        city: city.trim(),
        type,
        coordinatorUids: [],
        createdAt: serverTimestamp(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold" style={{ color: '#141348' }}>הוסף סניף</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">שם סניף *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">עיר *</label>
            <input value={city} onChange={(e) => setCity(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">סוג</label>
            <div className="flex gap-2">
              {([['food', 'מזון'], ['cafe_youth', 'בית קפה / נוער']] as const).map(([t, l]) => (
                <button key={t} onClick={() => setType(t)}
                  className="flex-1 py-2 rounded-lg text-sm border transition-all"
                  style={{
                    backgroundColor: type === t ? '#141348' : 'white',
                    color: type === t ? 'white' : '#141348',
                    borderColor: type === t ? '#141348' : '#E5E7EB',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={handleSave} disabled={saving || !name.trim() || !city.trim()}
            className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר...' : 'צור סניף'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

export function BranchesAdminPage() {
  const { branches, loading } = useAllBranches()
  const [selected, setSelected] = useState<Branch | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const currentQ = currentQuarter()
  const currentYear = new Date().getFullYear()

  if (loading) return <Spinner size="lg" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-navy">סניפים</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + הוסף סניף
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-teal050 text-brand-navy border-b border-gray-100">
            <tr>
              <th className="px-4 py-2.5 text-right font-medium">שם סניף</th>
              <th className="px-4 py-2.5 text-right font-medium">עיר</th>
              <th className="px-4 py-2.5 text-right font-medium">סוג</th>
              <th className="px-4 py-2.5 text-right font-medium">דיווח {currentQ} {currentYear}</th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">אין סניפים מוגדרים</td>
              </tr>
            )}
            {branches.map((b, i) => (
              <BranchRow
                key={b.id}
                branch={b}
                index={i}
                currentQ={currentQ}
                currentYear={currentYear}
                onClick={() => setSelected(b)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {selected && <BranchDetail branch={selected} onClose={() => setSelected(null)} />}
      {showAdd && <AddBranchModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function BranchRow({
  branch,
  index,
  currentQ,
  currentYear,
  onClick,
}: {
  branch: Branch
  index: number
  currentQ: QuarterLabel
  currentYear: number
  onClick: () => void
}) {
  const { reports } = useQuarterlyReports(branch.id)
  const hasReport = reports.some((r) => r.quarter === currentQ && r.year === currentYear)

  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-50 hover:bg-brand-teal050 transition-colors cursor-pointer ${index % 2 === 0 ? '' : 'bg-gray-50/30'}`}
    >
      <td className="px-4 py-2.5 font-medium text-brand-navy">{branch.name}</td>
      <td className="px-4 py-2.5 text-gray-600">{branch.city}</td>
      <td className="px-4 py-2.5 text-gray-500">{branch.type === 'food' ? 'מזון' : 'בית קפה / נוער'}</td>
      <td className="px-4 py-2.5">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded"
          style={hasReport
            ? { backgroundColor: '#C6EFCE', color: '#0A6B2E' }
            : { backgroundColor: '#FEE2E2', color: '#B91C1C' }
          }
        >
          {hasReport ? 'דווח' : 'לא דווח'}
        </span>
      </td>
    </tr>
  )
}
