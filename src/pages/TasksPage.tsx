import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTasks } from '../hooks/useTasks'
import { Spinner } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/StatusBadge'
import { DomainBadge } from '../components/ui/DomainBadge'
import { KanbanView } from '../components/kanban/KanbanView'
import { CalendarView } from '../components/calendar/CalendarView'
import { GanttView } from '../components/gantt/GanttView'
import {
  DOMAIN_LABELS, DOMAINS, STATUS_LABELS, FREQUENCY_LABELS,
  type Domain, type TaskStatus, type TaskFrequency
} from '../types'

type ViewMode = 'list' | 'kanban' | 'calendar' | 'gantt'

export function TasksPage() {
  const { tasks, loading } = useTasks()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')

  const domainFilter = searchParams.get('domain') as Domain | null
  const statusFilter = searchParams.get('status') as TaskStatus | null
  const freqFilter = searchParams.get('freq') as TaskFrequency | null

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (domainFilter && t.domain !== domainFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      if (freqFilter && t.frequency !== freqFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          t.title.toLowerCase().includes(q) ||
          t.responsible.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [tasks, domainFilter, statusFilter, freqFilter, search])

  const setFilter = (key: string, val: string | null) => {
    const p = new URLSearchParams(searchParams)
    if (val) p.set(key, val)
    else p.delete(key)
    setSearchParams(p)
  }

  if (loading) return <Spinner size="lg" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-navy">משימות</h1>
        <Link
          to="/tasks/new"
          className="bg-brand-teal hover:bg-brand-tealDark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + משימה חדשה
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-48"
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

          {(domainFilter || statusFilter || freqFilter || search) && (
            <button
              onClick={() => { setSearchParams({}); setSearch('') }}
              className="text-xs text-gray-500 hover:text-red-500 underline"
            >
              נקה מסננים
            </button>
          )}

          <span className="text-xs text-gray-400 mr-auto">{filtered.length} משימות</span>
        </div>

        {/* View toggle */}
        <div className="flex gap-1">
          {(['list', 'kanban', 'calendar', 'gantt'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === v
                  ? 'bg-brand-teal text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {{ list: '📋 רשימה', kanban: '🗂 קנבן', calendar: '📅 לוח שנה', gantt: '📊 גאנט' }[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-teal050 text-brand-navy border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-right font-medium">משימה</th>
                <th className="px-4 py-3 text-right font-medium">תחום</th>
                <th className="px-4 py-3 text-right font-medium">קטגוריה</th>
                <th className="px-4 py-3 text-right font-medium">אחראי</th>
                <th className="px-4 py-3 text-right font-medium">תדירות</th>
                <th className="px-4 py-3 text-right font-medium">סיום</th>
                <th className="px-4 py-3 text-right font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr
                  key={t.id}
                  className={`border-b border-gray-50 hover:bg-brand-teal050 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                >
                  <td className="px-4 py-3">
                    <Link to={`/tasks/${t.id}`} className="font-medium text-brand-navy hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <DomainBadge domain={t.domain} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.category}</td>
                  <td className="px-4 py-3 text-gray-600">{t.responsible}</td>
                  <td className="px-4 py-3 text-gray-500">{t.frequency}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {t.endDate ? t.endDate.toDate().toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    אין משימות להצגה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === 'kanban' && <KanbanView tasks={filtered} />}
      {view === 'calendar' && <CalendarView tasks={filtered} />}
      {view === 'gantt' && <GanttView tasks={filtered} />}
    </div>
  )
}
