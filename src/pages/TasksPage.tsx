import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useTasks } from '../hooks/useTasks'
import { exportTasks } from '../utils/export'
import { Spinner } from '../components/ui/Spinner'
import { DomainBadge } from '../components/ui/DomainBadge'
import { KanbanView } from '../components/kanban/KanbanView'
import { GanttView } from '../components/gantt/GanttView'
import {
  DOMAIN_LABELS, DOMAINS, STATUS_LABELS, FREQUENCY_LABELS,
  type Domain, type TaskStatus, type TaskFrequency, type Task
} from '../types'

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

function taskMatchesCurrentMonth(t: Task): boolean {
  if (!t.endDate) return false
  const now = new Date()
  const m = now.getMonth()
  const end = t.endDate.toDate()
  switch (t.frequency) {
    case 'חד-פעמי':
      return end.getFullYear() === now.getFullYear() && end.getMonth() === m
    case 'חודשי':
    case 'שוטף':
      return true
    case 'רבעוני':
      return [2, 5, 8, 11].includes(m)
    case 'חצי-שנתי':
      return [5, 11].includes(m)
    case 'שנתי':
    case 'לפי חג':
      return end.getMonth() === m
    default:
      return end.getFullYear() === now.getFullYear() && end.getMonth() === m
  }
}

export function TasksPage() {
  const { tasks, loading } = useTasks()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState(false)

  const domainFilter = searchParams.get('domain') as Domain | null
  const statusFilter = searchParams.get('status') as TaskStatus | null
  const freqFilter = searchParams.get('freq') as TaskFrequency | null

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (monthFilter && !taskMatchesCurrentMonth(t)) return false
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
  }, [tasks, monthFilter, domainFilter, statusFilter, freqFilter, search])

  const setFilter = (key: string, val: string | null) => {
    const p = new URLSearchParams(searchParams)
    if (val) p.set(key, val)
    else p.delete(key)
    setSearchParams(p)
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

          {/* Current month quick filter */}
          <button
            onClick={() => setMonthFilter(m => !m)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              monthFilter
                ? 'bg-brand-teal text-white border-brand-teal'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            📅 החודש הנוכחי
          </button>

          {hasAnyFilter && (
            <button
              onClick={() => { setSearchParams({}); setSearch(''); setMonthFilter(false) }}
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
                  <th className="px-4 py-2.5 text-right font-medium">אחראי</th>
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
                      <Link to={`/tasks/${t.id}`} className="font-medium text-brand-navy hover:underline">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <DomainBadge domain={t.domain} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{t.category}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.responsible}</td>
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
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
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
                  <Link to={`/tasks/${t.id}`} className="font-medium text-brand-navy hover:underline text-sm leading-snug">
                    {t.title}
                  </Link>
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
                  <span>{t.responsible}</span>
                  <span>{t.frequency}</span>
                  {t.endDate && <span>סיום: {t.endDate.toDate().toLocaleDateString('he-IL')}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'kanban' && <KanbanView tasks={filtered} />}
      {view === 'gantt' && <GanttView tasks={filtered} />}
    </div>
  )
}
