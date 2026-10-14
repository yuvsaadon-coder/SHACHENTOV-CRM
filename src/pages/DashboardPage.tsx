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
  type Domain, type TaskStatus, type TaskFrequency, type Task, type RoleStatus,
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
  if (!t.startDate) return false
  const now = new Date()
  const m = now.getMonth()
  const start = t.startDate.toDate()

  if (period === 'month') {
    switch (t.frequency) {
      case 'חד-פעמי': return start.getFullYear() === now.getFullYear() && start.getMonth() === m
      case 'חודשי': case 'שוטף': return true
      case 'רבעוני': return [2, 5, 8, 11].includes(m)
      case 'חצי-שנתי': return [5, 11].includes(m)
      case 'שנתי': case 'לפי חג': return start.getMonth() === m
      default: return start.getFullYear() === now.getFullYear() && start.getMonth() === m
    }
  }

  const q = Math.floor(m / 3)
  const qMonths = [q * 3, q * 3 + 1, q * 3 + 2]
  switch (t.frequency) {
    case 'חד-פעמי': return start.getFullYear() === now.getFullYear() && qMonths.includes(start.getMonth())
    case 'חודשי': case 'שוטף': return true
    case 'רבעוני': return true
    case 'חצי-שנתי': return [5, 11].some((mo) => qMonths.includes(mo))
    case 'שנתי': case 'לפי חג': return qMonths.includes(start.getMonth())
    default: return start.getFullYear() === now.getFullYear() && qMonths.includes(start.getMonth())
  }
}

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  all: 'כל הזמן',
  month: 'החודש',
  quarter: 'הרבעון',
}

const ALERT_STATUSES: RoleStatus[] = ['חסר', 'חלקי', 'בסיכון']

const ROLE_STATUS_CHIP: Record<RoleStatus, { bg: string; text: string }> = {
  'מאויש': { bg: '#C6EFCE', text: '#0A6B2E' },
  'חסר':   { bg: '#FEE2E2', text: '#B91C1C' },
  'חלקי':  { bg: '#FED7AA', text: '#9A3412' },
  'בסיכון':{ bg: '#FDC857', text: '#7A5A00' },
  'אחר':   { bg: '#E4DFEC', text: '#5F497A' },
}

export function DashboardPage() {
  const { tasks, loading } = useTasks()
  const { roles } = useRoles()
  const { appUser, orgRole } = useAuth()
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month')
  const [domainFreqFilter, setDomainFreqFilter] = useState<TaskFrequency | ''>('')
  const [rolesExpanded, setRolesExpanded] = useState(false)

  // Full access: admin or CEO domain
  const isFullAccess = !appUser || appUser.role === 'admin' || appUser.role === 'CEO'
  const myDomain: Domain | null = (!isFullAccess && DOMAINS.includes(appUser?.role as Domain))
    ? (appUser?.role as Domain)
    : null

  const periodTasks = useMemo(
    () => (periodFilter === 'all' ? tasks : tasks.filter((t) => taskMatchesPeriod(t, periodFilter))),
    [tasks, periodFilter]
  )

  // Org pulse: always org-wide totals
  const orgPulse = useMemo(() => {
    const done = periodTasks.filter((t) => t.status === 'בוצע').length
    const total = periodTasks.length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    const overdueCount = periodTasks.filter((t) => isOverdue(t.endDate, t.status)).length
    const alertCount = roles.filter((r) => (ALERT_STATUSES as string[]).includes(r.status)).length
    return { pct, overdueCount, alertCount, total, done }
  }, [periodTasks, roles])

  // Tasks visible to this user (filtered by domain for non-admins)
  const visibleTasks = useMemo(
    () => myDomain ? periodTasks.filter((t) => t.domain === myDomain) : periodTasks,
    [periodTasks, myDomain]
  )

  const stats = useMemo(() => {
    const byStatus: Record<TaskStatus, number> = {
      'בוצע': 0, 'בעבודה': 0, 'בהמתנה': 0, 'לא בוצע': 0, 'אחר': 0,
    }
    visibleTasks.forEach((t) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })
    return byStatus
  }, [visibleTasks])

  const domainStats = useMemo(() => {
    const base = domainFreqFilter
      ? visibleTasks.filter((t) => t.frequency === domainFreqFilter)
      : visibleTasks
    const domainsToShow = myDomain ? [myDomain] : DOMAINS
    return domainsToShow.map((domain) => {
      const dt = base.filter((t) => t.domain === domain)
      const done = dt.filter((t) => t.status === 'בוצע').length
      return { domain, total: dt.length, done }
    })
  }, [visibleTasks, domainFreqFilter, myDomain])

  const overdue = useMemo(
    () => visibleTasks.filter((t) => isOverdue(t.endDate, t.status)),
    [visibleTasks]
  )

  const alertRoles = useMemo(() => {
    const all = roles.filter((r) => (ALERT_STATUSES as string[]).includes(r.status)).map(applyDelegation)
    if (isFullAccess || !orgRole?.area) return all
    return all.filter((r) => r.area === orgRole.area)
  }, [roles, isFullAccess, orgRole])

  const myTasks = useMemo(() => {
    if (!appUser) return []
    return visibleTasks.filter((t) => (t.involved ?? []).includes(appUser.name))
  }, [visibleTasks, appUser])

  if (loading) return <Spinner size="lg" />

  const greeting = orgRole
    ? `${orgRole.roleName}${appUser?.name ? ` · ${appUser.name}` : ''}`
    : appUser?.name ?? ''

  return (
    <div className="space-y-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-brand-navy">לוח בקרה</h1>
          {greeting && <p className="text-xs text-gray-400 mt-0.5">{greeting}</p>}
        </div>

        {/* Period filter */}
        <div className="flex gap-1">
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
      </div>

      {/* Org pulse — compact, non-alarming context strip */}
      {!isFullAccess && (
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-6 flex-wrap text-sm"
          style={{ backgroundColor: '#F0FAFA', border: '1px solid #C8ECED' }}
        >
          <span className="text-xs text-gray-500 shrink-0">כלל ארגוני:</span>
          <span style={{ color: '#141348' }}>
            <strong>{orgPulse.pct}%</strong>
            <span className="text-gray-500 text-xs mr-1">ביצוע</span>
          </span>
          {orgPulse.overdueCount > 0 && (
            <span style={{ color: '#B91C1C' }}>
              <strong>{orgPulse.overdueCount}</strong>
              <span className="text-gray-500 text-xs mr-1">באיחור</span>
            </span>
          )}
          {orgPulse.alertCount > 0 && (
            <span style={{ color: '#9A3412' }}>
              <strong>{orgPulse.alertCount}</strong>
              <span className="text-gray-500 text-xs mr-1">תפקידים דורשים טיפול</span>
            </span>
          )}
          {orgPulse.overdueCount === 0 && orgPulse.alertCount === 0 && (
            <span className="text-xs" style={{ color: '#0A6B2E' }}>✓ הכל תקין</span>
          )}
        </div>
      )}

      {/* Status tiles */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {STATUS_LABELS.map((s) => (
          <div key={s} className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center border border-gray-100">
            <div className="text-xl sm:text-3xl font-bold text-brand-navy">{stats[s]}</div>
            <StatusBadge status={s} />
          </div>
        ))}
      </div>

      {/* Domain progress */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-brand-navy text-sm">
            {myDomain ? `תחום ${DOMAIN_LABELS[myDomain]}` : 'סטטוס לפי תחום'}
          </h2>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setDomainFreqFilter('')}
              className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                !domainFreqFilter ? 'bg-brand-teal text-white border-brand-teal' : 'text-gray-400 border-gray-200'
              }`}
            >
              הכל
            </button>
            {FREQUENCY_LABELS.map((f) => (
              <button
                key={f}
                onClick={() => setDomainFreqFilter(domainFreqFilter === f ? '' : (f as TaskFrequency))}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  domainFreqFilter === f ? 'bg-brand-teal text-white border-brand-teal' : 'text-gray-400 border-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2.5">
          {domainStats.map(({ domain, total, done }) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            return (
              <div key={domain} className="flex items-center gap-3">
                <div className="w-20 text-xs text-brand-navy2 text-right shrink-0">
                  {DOMAIN_LABELS[domain as Domain]}
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-brand-teal h-1.5 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 w-12 text-left">{done}/{total}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Overdue */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <h2 className="font-bold text-red-600 mb-3 text-sm">⚠ באיחור ({overdue.length})</h2>
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
          <h2 className="font-bold text-brand-navy mb-3 text-sm">👤 המשימות שלי ({myTasks.length})</h2>
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

      {/* Alert roles — collapsible */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <button
          onClick={() => setRolesExpanded((e) => !e)}
          className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-gray-50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-brand-navy text-sm">תפקידים הדורשים טיפול</span>
            {alertRoles.length > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                {alertRoles.length}
              </span>
            )}
          </div>
          <span className="text-gray-400 text-xs">{rolesExpanded ? '▼' : '▶'}</span>
        </button>

        {rolesExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100">
            {alertRoles.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">אין תפקידים הדורשים טיפול 🎉</p>
            ) : (
              <ul className="space-y-2 mt-3">
                {alertRoles.map((r) => {
                  const chip = ROLE_STATUS_CHIP[r.status] ?? ROLE_STATUS_CHIP['אחר']
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-brand-navy truncate">{r.roleName}</div>
                        {r.area && <div className="text-xs text-gray-400">{r.area} · {r.level}</div>}
                        {r.delegatedTo && (
                          <div className="text-xs text-orange-600">מואצל: {r.delegatedTo}</div>
                        )}
                      </div>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: chip.bg, color: chip.text }}
                      >
                        {r.status}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            <Link to="/roles" className="mt-3 block text-xs text-brand-teal hover:underline">
              לדף האיוש המלא ←
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
