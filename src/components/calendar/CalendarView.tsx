import { useMemo, useState } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { he } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { HDate } from '@hebcal/core'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../lib/firebase'
import type { Task, TaskStatus } from '../../types'
import { DOMAIN_COLORS, STATUS_LABELS } from '../../types'
import { getTextColor } from '../../utils/color'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const locales = { he }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
})

type CalEvent = {
  id?: string
  title: string
  start: Date
  end: Date
  resource?: Task
  isHoliday?: boolean
}

function getJewishHolidays(year: number): CalEvent[] {
  const holidays: CalEvent[] = []
  const hYear = new HDate(new Date(year, 0, 1)).getFullYear()
  for (const hy of [hYear, hYear + 1]) {
    const items = [
      { title: 'ראש השנה', date: new HDate(1, 7, hy).greg() },
      { title: 'יום כיפור', date: new HDate(10, 7, hy).greg() },
      { title: 'סוכות', date: new HDate(15, 7, hy).greg() },
      { title: 'חנוכה', date: new HDate(25, 9, hy).greg() },
      { title: 'פורים', date: new HDate(14, 12, hy).greg() },
      { title: 'פסח', date: new HDate(15, 1, hy).greg() },
      { title: 'שבועות', date: new HDate(6, 3, hy).greg() },
    ]
    for (const { title, date } of items) {
      if (date.getFullYear() === year) {
        holidays.push({ title: `🕎 ${title}`, start: date, end: date, isHoliday: true })
      }
    }
  }
  return holidays
}

const STATUS_STYLE: Record<TaskStatus, React.CSSProperties> = {
  'בוצע':    { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'בעבודה':  { backgroundColor: '#189A9F', color: '#ffffff' },
  'בהמתנה':  { backgroundColor: '#FDC857', color: '#7A5A00' },
  'לא בוצע': { backgroundColor: '#F3F4F6', color: '#4B5563' },
  'אחר':     { backgroundColor: '#E4DFEC', color: '#5F497A' },
}

const MONTH_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

function TaskRow({ task, onNavigate }: { task: Task; onNavigate: () => void }) {
  return (
    <div
      className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer group"
      onClick={onNavigate}
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
      <div className="min-w-0">
        <div className="text-xs font-medium text-brand-navy group-hover:underline truncate">{task.title}</div>
        {task.responsible && <div className="text-xs text-gray-400">{task.responsible}</div>}
      </div>
    </div>
  )
}

export function CalendarView({ tasks }: { tasks: Task[] }) {
  const [date, setDate] = useState(new Date())
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const { appUser } = useAuth()
  const navigate = useNavigate()

  const year = date.getFullYear()
  const month = date.getMonth()

  const displayTasks = useMemo(() => {
    if (!myTasksOnly || !appUser?.name) return tasks
    return tasks.filter(t =>
      t.responsible === appUser.name ||
      (t.involved ?? []).includes(appUser.name)
    )
  }, [tasks, myTasksOnly, appUser])

  const events = useMemo<CalEvent[]>(() => {
    const taskEvents: CalEvent[] = displayTasks
      .filter((t) => t.endDate)
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.startDate?.toDate() || t.endDate!.toDate(),
        end: t.endDate!.toDate(),
        resource: t,
      }))
    return [...taskEvents, ...getJewishHolidays(year)]
  }, [displayTasks, year])

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

  const eventStyleGetter = (event: CalEvent) => {
    if (event.isHoliday) {
      return { style: { backgroundColor: '#FDC857', color: '#141348', border: 'none', fontSize: '11px' } }
    }
    const color = event.resource ? (DOMAIN_COLORS[event.resource.domain] || '#189A9F') : '#189A9F'
    return { style: { backgroundColor: color, color: getTextColor(color), border: 'none', fontSize: '11px', borderRadius: '4px' } }
  }

  return (
    <div className="space-y-3">
      {/* Navigation + filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(new Date(year, month - 1))}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >←</button>
          <span className="font-bold text-brand-navy text-sm min-w-[140px] text-center">
            {MONTH_HE[month]} {year}
          </span>
          <button
            onClick={() => setDate(new Date(year, month + 1))}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >→</button>
          <button
            onClick={() => setDate(new Date())}
            className="text-xs text-brand-teal hover:underline px-2 py-1"
          >
            החודש הנוכחי
          </button>
        </div>
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

      {/* Calendar grid + month task list */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_290px] gap-4 items-start">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4" style={{ height: '62vh' }}>
          <style>{`
            .rbc-calendar { direction: rtl; font-family: Rubik, sans-serif; }
            .rbc-header { color: #141348; font-weight: 500; font-size: 12px; }
            .rbc-today { background-color: #E6F4F4; }
            .rbc-toolbar { display: none; }
            .rbc-month-view { border: none; }
            .rbc-month-row + .rbc-month-row { border-color: #F3F4F6; }
            .rbc-day-bg + .rbc-day-bg { border-color: #F3F4F6; }
          `}</style>
          <Calendar<CalEvent>
            localizer={localizer}
            events={events}
            date={date}
            defaultView="month"
            onNavigate={setDate}
            onSelectEvent={(e) => e.id && navigate(`/tasks/${e.id}`)}
            eventPropGetter={eventStyleGetter}
            messages={{ noEventsInRange: 'אין משימות', showMore: (n) => `+${n} עוד` }}
            rtl
          />
        </div>

        {/* Month task list panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          <div className="p-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <span className="font-semibold text-sm text-brand-navy">
              {MONTH_HE[month]} — {monthTasks.length} משימות
            </span>
          </div>
          <div className="p-2">
            {Object.entries(grouped.withAnchor).map(([anchor, anchorTasks]) => (
              <div key={anchor} className="mb-3">
                <div className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-md mb-1">
                  🕎 {anchor} ({anchorTasks.length})
                </div>
                {anchorTasks.map(t => (
                  <TaskRow key={t.id} task={t} onNavigate={() => navigate(`/tasks/${t.id}`)} />
                ))}
              </div>
            ))}
            {grouped.noAnchor.length > 0 && (
              <div>
                {Object.keys(grouped.withAnchor).length > 0 && (
                  <div className="text-xs text-gray-400 px-2 py-1">ללא עוגן חג</div>
                )}
                {grouped.noAnchor.map(t => (
                  <TaskRow key={t.id} task={t} onNavigate={() => navigate(`/tasks/${t.id}`)} />
                ))}
              </div>
            )}
            {monthTasks.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">אין משימות לחודש זה</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
