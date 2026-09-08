import { useMemo, useEffect } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useTasks } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import { useRecurringTaskReset } from '../hooks/useRecurringTaskReset'
import { exportTasks } from '../utils/export'
import { Spinner } from '../components/ui/Spinner'
import { DomainBadge } from '../components/ui/DomainBadge'
import { KanbanView } from '../components/kanban/KanbanView'
import { GanttView } from '../components/gantt/GanttView'
import {
  DOMAIN_LABELS, DOMAINS, STATUS_LABELS, FREQUENCY_LABELS,
  type Domain, type TaskStatus, type TaskFrequency, type Task
} from '../types'

const VIEW_PREF_KEY = (uid: string) => `viewPref_${uid}`

const STATUS_STYLE: Record<TaskStatus, React.CSSProperties> = {
  'בוצע':    { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'בעבודה':  { backgroundColor: '#189A9F', color: '#ffffff' },
  'בהמתנה':  { backgroundColor: '#FDC857', color: '#7A5A00' },
  'לא בוצע': { backgroundColor: '#F3F4F6', color: '#4B5563' },
  'אחר':     { backgroundColor: '#E4DFEC', color: '#5F497A' },
}

type ViewMode = 'list' | 'kanban' | 'gantt'

async function updateStatus(taskId: string, status: TaskStatus) {
  await updateDoc(doc(db, 'tasks', taskId), { status, updatedAt: serverTimestamp() })
}

function taskMatchesMonth(t: Task, ref: Date): boolean {
  if (!t.startDate) return false
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const start = t.startDate.toDate()
  switch (t.frequency) {
    case 'חד-פעמי':
      return start.getFullYear() === y && start.getMonth() === m
    case 'חודשי':
    case 'שוטף':
      return true
    case 'רבעוני':
      return [2, 5, 8, 11].includes(m)
    case 'חצי-שנתי':
      return [5, 11].includes(m)
    case 'שנתי':
    case 'לפי חג':
      return start.getMonth() === m
    default:
      return start.getFullYear() === y && start.getMonth() === m
  }
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function TasksPage() {
  const { tasks, loading } = useTasks()
  const { appUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  // Auto-reset recurring tasks when their cycle rolls over (admin only)
  useRecurringTaskReset(tasks, appUser?.role === 'admin')

  // All UI state lives in the URL so it survives navigation to/from task detail
  const view = (searchParams.get('view') as ViewMode) || 'list'
  const search = searchParams.get('search') || ''
  const monthFilter = searchParams.get('monthFilter') !== 'false'
  const selectedMonth = useMemo(() => {
    const m = searchParams.get('month')
    if (!m) return new Date()
    const [y, mo] = m.split('-').map(Number)
    return new Date(y, mo - 1, 1)
  }, [searchParams])
  const isCurrentMonth = useMemo(() => {
    const now = new Date()
    return selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() === now.getMonth()
  }, [selectedMonth])

  const domainFilter = searchParams.get('domain') as Domain | null
  const statusFilter = searchParams.get('status') as TaskStatus | null
  const freqFilter = searchParams.get('freq') as TaskFrequency | null

  const subTaskCountByParent = useMemo(() => {
    const map: Record<string, number> = {}
    tasks.filter((t) => t.parentTaskId).forEach((t) => {
      map[t.parentTaskId!] = (map[t.parentTaskId!] || 0) + 1
    })
    return map
  }, [tasks])

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (t.parentTaskId) return false
      if (monthFilter && !taskMatchesMonth(t, selectedMonth)) return false
      if (domainFilter && t.domain !== domainFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      if (freqFilter && t.frequency !== freqFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          t.title.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [tasks, monthFilter, selectedMonth, domainFilter, statusFilter, freqFilter, search])

  // On first entry (no URL params), set domain default for domain users and restore saved view
  useEffect(() => {
    if (!appUser || searchParams.size > 0) return
    const p = new URLSearchParams()
    const isDomainRole = (DOMAINS as readonly string[]).includes(appUser.role)
    if (isDomainRole) p.set('domain', appUser.role)
    const savedView = localStorage.getItem(VIEW_PREF_KEY(appUser.uid))
    if (savedView) p.set('view', savedView)
    if (p.size > 0) setSearchParams(p, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser?.uid])

  const setFilter = (key: string, val: string | null) => {
    const p = new URLSearchParams(searchParams)
    if (val) p.set(key, val)
    else p.delete(key)
    setSearchParams(p, { replace: true })
  }

  const setView = (v: ViewMode) => {
    if (appUser?.uid) localStorage.setItem(VIEW_PREF_KEY(appUser.uid), v)
    setFilter('view', v === 'list' ? null : v)
  }
  const setSearch = (s: string) => setFilter('search', s || null)
  const setMonthFilter = (fn: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof fn === 'function' ? fn(monthFilter) : fn
    setFilter('monthFilter', next ? null : 'false')
  }
  const setSelectedMonth = (fn: Date | ((prev: Date) => Date)) => {
    const next = typeof fn === 'function' ? fn(selectedMonth) : fn
    setFilter('month', `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  const hasAnyFilter = !!(domainFilter || statusFilter || freqFilter || search || monthFilter)

  if (loading) return <Spinner size="lg" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-navy">משימות</h1>
        <div className="flex gap-2">
          <button
            onClick={() => exportTasks(filtered)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          >
            ייצוא CSV
          </button>
          <Link
            to="/tasks/new"
            className="bg-brand-teal hover:bg-brand-tealDark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + משימה חדשה
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-3 border border-gray-100 space-y-2.5">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-full sm:w-48"
          />

          <select
            value={domainFilter || ''}
            onChange={(e) => setFilter('domain', e.target.value || null)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="">כל התחומים</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{DOMAIN_LABELS[d as Domain]}</option>
            ))}
          </select>

          <select
            value={statusFilter || ''}
            onChange={(e) => setFilter('status', e.target.value || null)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="">כל הסטטוסים</option>
            {STATUS_LABELS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={freqFilter || ''}
            onChange={(e) => setFilter('freq', e.target.value || null)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="">כל התדירויות</option>
            {FREQUENCY_LABELS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          {/* Month filter + navigation */}
          <button
            onClick={() => setMonthFilter(m => !m)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              monthFilter
                ? 'bg-brand-teal text-white border-brand-teal'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            📅 סינון לפי חודש
          </button>

          {monthFilter && (
            <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg px-1 py-0.5">
              <button
                onClick={() => setSelectedMonth((m) => addMonths(m, -1))}
                className="px-1.5 py-0.5 text-gray-500 hover:text-brand-navy hover:bg-gray-50 rounded"
                aria-label="חודש קודם"
              >
                ‹
              </button>
              <span className="text-xs font-medium text-brand-navy min-w-[92px] text-center select-none">
                {selectedMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => setSelectedMonth((m) => addMonths(m, 1))}
                className="px-1.5 py-0.5 text-gray-500 hover:text-brand-navy hover:bg-gray-50 rounded"
                aria-label="חודש הבא"
              >
                ›
              </button>
              {!isCurrentMonth && (
                <button
                  onClick={() => setSelectedMonth(new Date())}
                  className="text-xs text-brand-teal hover:underline px-1.5"
                >
                  היום
                </button>
              )}
            </div>
          )}

          {hasAnyFilter && (
            <button
              onClick={() => setSearchParams({}, { replace: true })}
              className="text-xs text-gray-500 hover:text-red-500 underline"
            >
              נקה מסננים
            </button>
          )}

          <span className="text-xs text-gray-400 mr-auto">{filtered.length} משימות</span>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {(['list', 'kanban', 'gantt'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === v
                  ? 'bg-brand-teal text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {{ list: '📋 רשימה', kanban: '🗂 קנבן', gantt: '📊 גאנט' }[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === 'list' && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-brand-teal050 text-brand-navy border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2.5 text-right font-medium">משימה</th>
                  <th className="px-4 py-2.5 text-right font-medium">תחום</th>
                  <th className="px-4 py-2.5 text-right font-medium">קטגוריה</th>
                  <th className="px-4 py-2.5 text-right font-medium">תדירות</th>
                  <th className="px-4 py-2.5 text-right font-medium">סיום</th>
                  <th className="px-4 py-2.5 text-right font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-b border-gray-50 hover:bg-brand-teal050 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                  >
                    <td className="px-4 py-2.5">
                      <Link to={`/tasks/${t.id}`} state={{ backSearch: location.search }} className="font-medium text-brand-navy hover:underline">
                        {t.title}
                      </Link>
                      {subTaskCountByParent[t.id] && (
                        <span className="mr-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                          📋 {subTaskCountByParent[t.id]}
                        </span>
                      )}
                      {!!t.attachmentCount && (
                        <span className="mr-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                          📎 {t.attachmentCount}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <DomainBadge domain={t.domain} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{t.category}</td>
                    <td className="px-4 py-2.5 text-gray-500">{t.frequency}</td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {t.endDate ? t.endDate.toDate().toLocaleDateString('he-IL') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={t.status}
                        onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}
                        onClick={(e) => e.stopPropagation()}
                        style={STATUS_STYLE[t.status]}
                        className="text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-teal"
                      >
                        {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      אין משימות להצגה
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">אין משימות להצגה</div>
            )}
            {filtered.map((t) => (
              <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <Link to={`/tasks/${t.id}`} state={{ backSearch: location.search }} className="font-medium text-brand-navy hover:underline text-sm leading-snug">
                      {t.title}
                    </Link>
                    {subTaskCountByParent[t.id] && (
                      <span className="mr-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        📋 {subTaskCountByParent[t.id]}
                      </span>
                    )}
                    {!!t.attachmentCount && (
                      <span className="mr-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        📎 {t.attachmentCount}
                      </span>
                    )}
                  </div>
                  <select
                    value={t.status}
                    onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}
                    onClick={(e) => e.stopPropagation()}
                    style={STATUS_STYLE[t.status]}
                    className="text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer focus:outline-none shrink-0"
                  >
                    {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                  <DomainBadge domain={t.domain} />
                  {t.category && <span>{t.category}</span>}
                  <span>{t.frequency}</span>
                  {t.endDate && <span>סיום: {t.endDate.toDate().toLocaleDateString('he-IL')}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'kanban' && <KanbanView tasks={filtered} />}
      {view === 'gantt' && <GanttView tasks={filtered} singleMonth={monthFilter ? selectedMonth : undefined} />}
    </div>
  )
}
