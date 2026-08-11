import { useMemo, useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useTasks } from '../hooks/useTasks'
import { useRoles, applyDelegation } from '../hooks/useRoles'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  DOMAIN_LABELS, DOMAINS, STATUS_LABELS, FREQUENCY_LABELS,
  type Domain, type TaskStatus, type TaskFrequency, type Task,
} from '../types'
import { Link } from 'react-router-dom'

type PeriodFilter = 'all' | 'month' | 'quarter'

const STATUS_STYLE: Record<TaskStatus, React.CSSProperties> = {
  'בוצע':    { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'בעבודה':  { backgroundColor: '#189A9F', color: '#ffffff' },
  'בהמתנה':  { backgroundColor: '#FDC857', color: '#7A5A00' },
  'לא בוצע': { backgroundColor: '#F3F4F6', color: '#4B5563' },
  'אחר':     { backgroundColor: '#E4DFEC', color: '#5F497A' },
}

async function updateStatus(taskId: string, status: TaskStatus) {
  await updateDoc(doc(db, 'tasks', taskId), { status, updatedAt: serverTimestamp() })
}

function isOverdue(ts: { toDate: () => Date } | null, status: TaskStatus) {
  if (!ts || status === 'בוצע') return false
  return ts.toDate() < new Date()
}

function taskMatchesPeriod(t: Task, period: PeriodFilter): boolean {
  if (period === 'all') return true
  if (!t.endDate) return false
  const now = new Date()
  const m = now.getMonth()
  const end = t.endDate.toDate()

  if (period === 'month') {
    switch (t.frequency) {
      case 'חד-פעמי': return end.getFullYear() === now.getFullYear() && end.getMonth() === m
      case 'חודשי': case 'שוטף': return true
      case 'רבעוני': return [2, 5, 8, 11].includes(m)
      case 'חצי-שנתי': return [5, 11].includes(m)
      case 'שנתי': case 'לפי חג': return end.getMonth() === m
      default: return end.getFullYear() === now.getFullYear() && end.getMonth() === m
    }
  }

  // quarter
  const q = Math.floor(m / 3)
  const qMonths = [q * 3, q * 3 + 1, q * 3 + 2]
  switch (t.frequency) {
    case 'חד-פעמי': return end.getFullYear() === now.getFullYear() && qMonths.includes(end.getMonth())
    case 'חודשי': case 'שוטף': return true
    case 'רבעוני': return true
    case 'חצי-שנתי': return [5, 11].some((mo) => qMonths.includes(mo))
    case 'שנתי': case 'לפי חג': return qMonths.includes(end.getMonth())
    default: return end.getFullYear() === now.getFullYear() && qMonths.includes(end.getMonth())
  }
}

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  all: 'כל הזמן',
  month: 'החודש הנוכחי',
  quarter: 'הרבעון הנוכחי',
}

export function DashboardPage() {
  const { tasks, loading } = useTasks()
  const { roles } = useRoles()
  const { appUser } = useAuth()
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month')
  const [domainCollapsed, setDomainCollapsed] = useState(false)
  const [domainFreqFilter, setDomainFreqFilter] = useState<TaskFrequency | ''>('')

  const periodTasks = useMemo(
    () => (periodFilter === 'all' ? tasks : tasks.filter((t) => taskMatchesPeriod(t, periodFilter))),
    [tasks, periodFilter]
  )

  const stats = useMemo(() => {
    const byStatus: Record<TaskStatus, number> = {
      'בוצע': 0, 'בעבודה': 0, 'בהמתנה': 0, 'לא בוצע': 0, 'אחר': 0,
    }
    periodTasks.forEach((t) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })
    return byStatus
  }, [periodTasks])

  const domainStats = useMemo(() => {
    const base = domainFreqFilter
      ? periodTasks.filter((t) => t.frequency === domainFreqFilter)
      : periodTasks
    return DOMAINS.map((domain) => {
      const dt = base.filter((t) => t.domain === domain)
      const done = dt.filter((t) => t.status === 'בוצע').length
      return { domain, total: dt.length, done }
    })
  }, [periodTasks, domainFreqFilter])

  const overdue = useMemo(
    () => periodTasks.filter((t) => isOverdue(t.endDate, t.status)),
    [periodTasks]
  )

  const vacantHQ = useMemo(
    () => roles.filter((r) => r.level === 'מטה' && r.status === 'חסר').map(applyDelegation),
    [roles]
  )
  const atRiskRoles = useMemo(() => roles.filter((r) => r.status === 'בסיכון'), [roles])

  const myTasks = useMemo(() => {
    if (!appUser) return []
    return periodTasks.filter(
      (t) => t.responsible === appUser.name || t.involved.includes(appUser.name)
    )
  }, [periodTasks, appUser])

  if (loading) return <Spinner size="lg" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-brand-navy">לוח בקרה</h1>
        <span className="text-sm text-gray-500">{periodTasks.length} / {tasks.length} משימות</span>
      </div>

      {/* Period filter */}
      <div className="flex gap-1.5 flex-wrap">
        {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodFilter(p)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              backgroundColor: periodFilter === p ? '#141348' : 'white',
              color: periodFilter === p ? 'white' : '#6B7280',
              borderColor: periodFilter === p ? '#141348' : '#E5E7EB',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Status matrix */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {STATUS_LABELS.map((s) => (
          <div key={s} className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center border border-gray-100">
            <div className="text-xl sm:text-3xl font-bold text-brand-navy">{stats[s]}</div>
            <StatusBadge status={s} />
          </div>
        ))}
      </div>

      {/* Domain progress — collapsible with frequency filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <button
          onClick={() => setDomainCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-gray-50 transition-colors rounded-xl"
        >
          <h2 className="font-bold text-brand-navy">סטטוס לפי תחום</h2>
          <span className="text-gray-400 text-xs">{domainCollapsed ? '▶' : '▼'}</span>
        </button>

        {!domainCollapsed && (
          <div className="px-4 pb-4">
            {/* Frequency chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setDomainFreqFilter('')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  !domainFreqFilter
                    ? 'bg-brand-teal text-white border-brand-teal'
                    : 'text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                הכל
              </button>
              {FREQUENCY_LABELS.map((f) => (
                <button
                  key={f}
                  onClick={() => setDomainFreqFilter(domainFreqFilter === f ? '' : (f as TaskFrequency))}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    domainFreqFilter === f
                      ? 'bg-brand-teal text-white border-brand-teal'
                      : 'text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Progress bars */}
            <div className="space-y-3">
              {domainStats.map(({ domain, total, done }) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                return (
                  <div key={domain} className="flex items-center gap-3">
                    <div className="w-24 text-sm text-brand-navy2 text-right shrink-0">
                      {DOMAIN_LABELS[domain as Domain]}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-brand-teal h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 w-16 text-left">{done}/{total}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Overdue */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <h2 className="font-bold text-red-600 mb-3">⚠ באיחור ({overdue.length})</h2>
          <ul className="space-y-2">
            {overdue.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <Link to={`/tasks/${t.id}`} className="text-sm text-brand-navy hover:underline truncate">
                  {t.title}
                </Link>
                <select
                  value={t.status}
                  onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}
                  onClick={(e) => e.stopPropagation()}
                  style={STATUS_STYLE[t.status]}
                  className="text-xs font-medium px-1.5 py-0.5 rounded border-0 cursor-pointer focus:outline-none shrink-0"
                >
                  {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </li>
            ))}
            {overdue.length === 0 && <li className="text-sm text-gray-400">אין משימות באיחור 🎉</li>}
            {overdue.length > 5 && (
              <li>
                <Link to="/tasks" className="text-xs text-brand-teal hover:underline">
                  +{overdue.length - 5} נוספות ←
                </Link>
              </li>
            )}
          </ul>
        </div>

        {/* My tasks */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <h2 className="font-bold text-brand-navy mb-3">👤 המשימות שלי ({myTasks.length})</h2>
          <ul className="space-y-2">
            {myTasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <Link to={`/tasks/${t.id}`} className="text-sm text-brand-navy hover:underline truncate">
                  {t.title}
                </Link>
                <select
                  value={t.status}
                  onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}
                  onClick={(e) => e.stopPropagation()}
                  style={STATUS_STYLE[t.status]}
                  className="text-xs font-medium px-1.5 py-0.5 rounded border-0 cursor-pointer focus:outline-none shrink-0"
                >
                  {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </li>
            ))}
            {myTasks.length === 0 && <li className="text-sm text-gray-400">אין משימות מוקצות</li>}
            {myTasks.length > 5 && (
              <li>
                <Link to="/tasks" className="text-xs text-brand-teal hover:underline">
                  +{myTasks.length - 5} נוספות ←
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Roles alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-red-100">
          <h2 className="font-bold text-red-600 mb-3">
            🔴 תפקידי מטה חסרים ({vacantHQ.length})
          </h2>
          <ul className="space-y-2">
            {vacantHQ.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-brand-navy truncate">{r.roleName}</span>
                <span className="text-xs bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded shrink-0">
                  מואצל: {r.delegatedTo}
                </span>
              </li>
            ))}
            {vacantHQ.length === 0 && (
              <li className="text-sm text-gray-400">אין חסרים במטה 🎉</li>
            )}
          </ul>
          <Link to="/roles" className="mt-3 block text-xs text-brand-teal hover:underline">
            כל תפקידי האיוש ←
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-yellow-100">
          <h2 className="font-bold text-yellow-600 mb-3">
            ⚠ תפקידים בסיכון ({atRiskRoles.length})
          </h2>
          <ul className="space-y-2">
            {atRiskRoles.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-brand-navy truncate">{r.roleName}</span>
                <span className="text-xs text-gray-400 shrink-0">{r.area}</span>
              </li>
            ))}
            {atRiskRoles.length === 0 && (
              <li className="text-sm text-gray-400">אין תפקידים בסיכון 🎉</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
