import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../lib/firebase'
import type { Task, TaskFrequency, TaskStatus } from '../../types'
import { STATUS_LABELS, DOMAIN_COLORS, DOMAIN_LABELS, FREQUENCY_LABELS } from '../../types'
import { getTextColor } from '../../utils/color'

const STATUS_STYLE: Record<TaskStatus, React.CSSProperties> = {
  'בוצע':    { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'בעבודה':  { backgroundColor: '#189A9F', color: '#ffffff' },
  'בהמתנה':  { backgroundColor: '#FDC857', color: '#7A5A00' },
  'לא בוצע': { backgroundColor: '#F3F4F6', color: '#4B5563' },
  'אחר':     { backgroundColor: '#E4DFEC', color: '#5F497A' },
}

const FREQ_SHORT: Record<TaskFrequency, string> = {
  'חד-פעמי':   'חד-פ׳',
  'חודשי':     'חודשי',
  'רבעוני':    'רבעוני',
  'חצי-שנתי':  'חצי-שנ׳',
  'שנתי':      'שנתי',
  'שוטף':      'שוטף',
  'לפי חג':    'לפי חג',
}

const MONTH_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

function taskMatchesMonth(t: Task, year: number, month: number): boolean {
  if (!t.endDate) return false
  const end = t.endDate.toDate()
  switch (t.frequency) {
    case 'חד-פעמי':
      return end.getFullYear() === year && end.getMonth() === month
    case 'חודשי':
    case 'שוטף':
      return true
    case 'רבעוני':
      return [2, 5, 8, 11].includes(month)
    case 'חצי-שנתי':
      return [5, 11].includes(month)
    case 'שנתי':
    case 'לפי חג':
      return end.getMonth() === month
    default:
      return end.getFullYear() === year && end.getMonth() === month
  }
}

function StatusSelect({ task }: { task: Task }) {
  return (
    <select
      value={task.status}
      onChange={(e) => {
        e.stopPropagation()
        updateDoc(doc(db, 'tasks', task.id), { status: e.target.value, updatedAt: serverTimestamp() })
      }}
      onClick={(e) => e.stopPropagation()}
      style={STATUS_STYLE[task.status]}
      className="text-xs font-medium px-1.5 py-0.5 rounded border-0 cursor-pointer shrink-0"
    >
      {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}

function TaskRow({ task }: { task: Task }) {
  const navigate = useNavigate()
  const domainColor = DOMAIN_COLORS[task.domain] || '#189A9F'
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer group border border-transparent hover:border-gray-100 transition-all"
      onClick={() => navigate(`/tasks/${task.id}`)}
    >
      <div className="mt-0.5"><StatusSelect task={task} /></div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-brand-navy group-hover:underline truncate">{task.title}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.endDate && (
            <span className="text-xs text-gray-400">
              {task.endDate.toDate().toLocaleDateString('he-IL')}
            </span>
          )}
          <span className="text-xs text-gray-300">{FREQ_SHORT[task.frequency]}</span>
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

function CompactRow({ task }: { task: Task }) {
  const navigate = useNavigate()
  const domainColor = DOMAIN_COLORS[task.domain] || '#189A9F'
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 group"
      onClick={() => navigate(`/tasks/${task.id}`)}
    >
      <StatusSelect task={task} />
      <span className="text-sm text-brand-navy truncate flex-1 min-w-0 group-hover:underline">{task.title}</span>
      <span
        style={{ backgroundColor: domainColor, color: getTextColor(domainColor) }}
        className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium"
      >
        {DOMAIN_LABELS[task.domain]}
      </span>
    </div>
  )
}

function SectionHeader({
  label, count, icon, collapsed, onToggle,
}: {
  label: string
  count: number
  icon?: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2 text-right border-b border-gray-100 hover:bg-gray-50 transition-colors"
      style={{ background: 'transparent' }}
    >
      <span className="text-xs font-semibold text-gray-600 flex-1 text-right">
        {icon && <span className="ml-1">{icon}</span>}
        {label}
        <span className="text-gray-400 font-normal mr-1.5">({count})</span>
      </span>
      <span className="text-gray-400 text-xs">{collapsed ? '▶' : '▼'}</span>
    </button>
  )
}

export function CalendarView({ tasks }: { tasks: Task[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [compact, setCompact] = useState(false)
  const [selectedFreqs, setSelectedFreqs] = useState<Set<TaskFrequency>>(new Set(FREQUENCY_LABELS))
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const { appUser } = useAuth()

  const goBack = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const goForward = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const toggleFreq = (f: TaskFrequency) => {
    setSelectedFreqs(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const displayTasks = useMemo(() => {
    if (myTasksOnly && appUser?.name) {
      return tasks.filter(t => (t.involved ?? []).includes(appUser.name))
    }
    return tasks
  }, [tasks, myTasksOnly, appUser])

  const monthTasks = useMemo(() => {
    return displayTasks
      .filter(t => taskMatchesMonth(t, year, month) && selectedFreqs.has(t.frequency))
      .sort((a, b) => {
        if (!a.endDate && !b.endDate) return 0
        if (!a.endDate) return 1
        if (!b.endDate) return -1
        return a.endDate.toDate().getTime() - b.endDate.toDate().getTime()
      })
  }, [displayTasks, year, month, selectedFreqs])

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
  const RowComponent = compact ? CompactRow : TaskRow

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

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">{monthTasks.length} משימות</span>

          {/* Compact toggle */}
          <button
            onClick={() => setCompact(c => !c)}
            title={compact ? 'תצוגה מורחבת' : 'תצוגה קומפקטית'}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              compact ? 'bg-brand-navy text-white border-brand-navy' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {compact ? '☰ קומפקטי' : '≡ קומפקטי'}
          </button>

          {/* My tasks toggle */}
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

      {/* Frequency filter chips */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-3 py-2 flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-gray-400 ml-1">סינון תדירות:</span>
        {FREQUENCY_LABELS.map(freq => {
          const active = selectedFreqs.has(freq)
          return (
            <button
              key={freq}
              onClick={() => toggleFreq(freq)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                active
                  ? 'bg-brand-teal text-white border-brand-teal'
                  : 'text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {FREQ_SHORT[freq]}
            </button>
          )
        })}
        {selectedFreqs.size < FREQUENCY_LABELS.length && (
          <button
            onClick={() => setSelectedFreqs(new Set(FREQUENCY_LABELS))}
            className="text-xs text-brand-teal hover:underline px-1"
          >
            הכל
          </button>
        )}
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
            {Object.entries(grouped.withAnchor).map(([anchor, anchorTasks]) => {
              const isCollapsed = collapsedSections.has(anchor)
              return (
                <div key={anchor}>
                  <SectionHeader
                    label={anchor}
                    count={anchorTasks.length}
                    icon="🕎"
                    collapsed={isCollapsed}
                    onToggle={() => toggleSection(anchor)}
                  />
                  {!isCollapsed && (
                    <div className={compact ? '' : 'px-2 py-1'}>
                      {anchorTasks.map(t => <RowComponent key={t.id} task={t} />)}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Tasks without anchor */}
            {grouped.noAnchor.length > 0 && (
              <div>
                {hasAnchorGroups && (
                  <SectionHeader
                    label="ללא נקודת ציון שנתית"
                    count={grouped.noAnchor.length}
                    collapsed={collapsedSections.has('noAnchor')}
                    onToggle={() => toggleSection('noAnchor')}
                  />
                )}
                {!collapsedSections.has('noAnchor') && (
                  <div className={compact ? '' : 'px-2 py-1'}>
                    {grouped.noAnchor.map(t => <RowComponent key={t.id} task={t} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
