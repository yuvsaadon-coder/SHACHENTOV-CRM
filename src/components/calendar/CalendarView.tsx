import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../lib/firebase'
import type { Task, TaskStatus } from '../../types'
import { STATUS_LABELS, DOMAIN_COLORS, DOMAIN_LABELS } from '../../types'
import { getTextColor } from '../../utils/color'

const STATUS_STYLE: Record<TaskStatus, React.CSSProperties> = {
  'בוצע':    { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'בעבודה':  { backgroundColor: '#189A9F', color: '#ffffff' },
  'בהמתנה':  { backgroundColor: '#FDC857', color: '#7A5A00' },
  'לא בוצע': { backgroundColor: '#F3F4F6', color: '#4B5563' },
  'אחר':     { backgroundColor: '#E4DFEC', color: '#5F497A' },
}

const MONTH_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

function TaskRow({ task }: { task: Task }) {
  const navigate = useNavigate()
  const domainColor = DOMAIN_COLORS[task.domain] || '#189A9F'
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer group border border-transparent hover:border-gray-100 transition-all"
      onClick={() => navigate(`/tasks/${task.id}`)}
    >
      <select
        value={task.status}
        onChange={(e) => {
          e.stopPropagation()
          updateDoc(doc(db, 'tasks', task.id), { status: e.target.value, updatedAt: serverTimestamp() })
        }}
        onClick={(e) => e.stopPropagation()}
        style={STATUS_STYLE[task.status]}
        className="text-xs font-medium px-1.5 py-0.5 rounded border-0 cursor-pointer shrink-0 mt-0.5"
      >
        {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-brand-navy group-hover:underline truncate">{task.title}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.responsible && <span className="text-xs text-gray-400">{task.responsible}</span>}
          {task.endDate && (
            <span className="text-xs text-gray-400">
              {task.endDate.toDate().toLocaleDateString('he-IL')}
            </span>
          )}
        </div>
      </div>
      <span
        style={{ backgroundColor: domainColor, color: getTextColor(domainColor) }}
        className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium"
      >
        {DOMAIN_LABELS[task.domain]}
      </span>
    </div>
  )
}

export function CalendarView({ tasks }: { tasks: Task[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const { appUser } = useAuth()

  const goBack = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const goForward = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const displayTasks = useMemo(() => {
    if (!myTasksOnly || !appUser?.name) return tasks
    return tasks.filter(t =>
      t.responsible === appUser.name ||
      (t.involved ?? []).includes(appUser.name)
    )
  }, [tasks, myTasksOnly, appUser])

  const monthTasks = useMemo(() => {
    return displayTasks
      .filter(t => {
        if (!t.endDate) return false
        const d = t.endDate.toDate()
        return d.getFullYear() === year && d.getMonth() === month
      })
      .sort((a, b) => a.endDate!.toDate().getTime() - b.endDate!.toDate().getTime())
  }, [displayTasks, year, month])

  const grouped = useMemo(() => {
    const withAnchor: Record<string, Task[]> = {}
    const noAnchor: Task[] = []
    for (const t of monthTasks) {
      if (t.holidayAnchor) {
        if (!withAnchor[t.holidayAnchor]) withAnchor[t.holidayAnchor] = []
        withAnchor[t.holidayAnchor].push(t)
      } else {
        noAnchor.push(t)
      }
    }
    return { withAnchor, noAnchor }
  }, [monthTasks])

  const hasAnchorGroups = Object.keys(grouped.withAnchor).length > 0

  return (
    <div className="space-y-3">
      {/* Navigation bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 text-lg">←</button>
          <span className="font-bold text-brand-navy text-base min-w-[160px] text-center">
            {MONTH_HE[month]} {year}
          </span>
          <button onClick={goForward} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 text-lg">→</button>
          {(year !== today.getFullYear() || month !== today.getMonth()) && (
            <button
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
              className="text-xs text-brand-teal hover:underline px-2 py-1"
            >
              החודש הנוכחי
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{monthTasks.length} משימות</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setMyTasksOnly(false)}
              className={`px-3 py-1.5 transition-colors ${!myTasksOnly ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              כל המשימות
            </button>
            <button
              onClick={() => setMyTasksOnly(true)}
              className={`px-3 py-1.5 transition-colors ${myTasksOnly ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              המשימות שלי
            </button>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {monthTasks.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <div className="text-3xl mb-3">📫</div>
            <div>אין משימות לחודש {MONTH_HE[month]}</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Holiday anchor groups */}
            {Object.entries(grouped.withAnchor).map(([anchor, anchorTasks]) => (
              <div key={anchor}>
                <div className="px-4 py-2.5 bg-amber-50 flex items-center gap-2 border-b border-amber-100">
                  <span className="text-amber-700 font-semibold text-sm">🕎 {anchor}</span>
                  <span className="text-xs text-amber-600">({anchorTasks.length} משימות)</span>
                </div>
                <div className="px-2 py-1">
                  {anchorTasks.map(t => <TaskRow key={t.id} task={t} />)}
                </div>
              </div>
            ))}

            {/* Tasks without anchor */}
            {grouped.noAnchor.length > 0 && (
              <div>
                {hasAnchorGroups && (
                  <div className="px-4 py-2 text-xs text-gray-400 font-medium bg-gray-50 border-b border-gray-100">
                    ללא עוגן חג
                  </div>
                )}
                <div className="px-2 py-1">
                  {grouped.noAnchor.map(t => <TaskRow key={t.id} task={t} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
