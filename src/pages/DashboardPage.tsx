import { useMemo } from 'react'
import { useTasks } from '../hooks/useTasks'
import { useRoles, applyDelegation } from '../hooks/useRoles'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/StatusBadge'
import { DOMAIN_LABELS, DOMAINS, STATUS_LABELS, type Domain, type TaskStatus } from '../types'
import { Link } from 'react-router-dom'

function isSoon(ts: { toDate: () => Date } | null, days: number) {
  if (!ts) return false
  const d = ts.toDate()
  const now = new Date()
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= days
}

function isOverdue(ts: { toDate: () => Date } | null, status: TaskStatus) {
  if (!ts || status === 'בוצע') return false
  return ts.toDate() < new Date()
}

export function DashboardPage() {
  const { tasks, loading } = useTasks()
  const { roles } = useRoles()
  const { appUser } = useAuth()

  const stats = useMemo(() => {
    const byStatus: Record<TaskStatus, number> = {
      'בוצע': 0, 'בעבודה': 0, 'בהמתנה': 0, 'לא בוצע': 0, 'אחר': 0,
    }
    tasks.forEach((t) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1 })
    return byStatus
  }, [tasks])

  const domainStats = useMemo(() => {
    return DOMAINS.map((domain) => {
      const dt = tasks.filter((t) => t.domain === domain)
      const done = dt.filter((t) => t.status === 'בוצע').length
      return { domain, total: dt.length, done }
    })
  }, [tasks])

  const soon7 = useMemo(() => tasks.filter((t) => isSoon(t.endDate, 7)), [tasks])
  // soon30 available for future use
  const _soon30 = useMemo(() => tasks.filter((t) => isSoon(t.endDate, 30) && !isSoon(t.endDate, 7)), [tasks])
  void _soon30
  const overdue = useMemo(() => tasks.filter((t) => isOverdue(t.endDate, t.status)), [tasks])

  const vacantHQ = useMemo(() =>
    roles.filter((r) => r.level === 'מטה' && r.status === 'חסר').map(applyDelegation),
    [roles]
  )
  const atRiskRoles = useMemo(() => roles.filter((r) => r.status === 'בסיכון'), [roles])

  const myTasks = useMemo(() => {
    if (!appUser) return []
    return tasks.filter(
      (t) => t.responsible === appUser.name || t.involved.includes(appUser.name)
    )
  }, [tasks, appUser])

  if (loading) return <Spinner size="lg" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">לוח בקרה</h1>
        <span className="text-sm text-gray-500">{tasks.length} משימות בסך הכל</span>
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

      {/* Domain progress */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
        <h2 className="font-bold text-brand-navy mb-3">סטטוס לפי תחום</h2>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overdue */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <h2 className="font-bold text-red-600 mb-3">⚠ באיחור ({overdue.length})</h2>
          <ul className="space-y-2">
            {overdue.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link to={`/tasks/${t.id}`} className="text-sm text-brand-navy hover:underline block truncate">
                  {t.title}
                </Link>
              </li>
            ))}
            {overdue.length === 0 && <li className="text-sm text-gray-400">אין משימות באיחור 🎉</li>}
          </ul>
        </div>

        {/* Soon 7 days */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <h2 className="font-bold text-brand-navy mb-3">📅 ב-7 הימים הקרובים ({soon7.length})</h2>
          <ul className="space-y-2">
            {soon7.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link to={`/tasks/${t.id}`} className="text-sm text-brand-navy hover:underline block truncate">
                  {t.title}
                </Link>
              </li>
            ))}
            {soon7.length === 0 && <li className="text-sm text-gray-400">אין משימות קרובות</li>}
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
                <StatusBadge status={t.status} />
              </li>
            ))}
            {myTasks.length === 0 && <li className="text-sm text-gray-400">אין משימות מוקצות</li>}
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
