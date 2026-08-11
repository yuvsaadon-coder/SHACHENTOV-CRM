import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task, Domain } from '../../types'
import { DOMAIN_COLORS, DOMAIN_LABELS, DOMAINS } from '../../types'
import { getTextColor } from '../../utils/color'
import { useAuth } from '../../context/AuthContext'

type FilterMode = 'domain' | 'person'
type TimelineMode = 'monthly' | 'quarterly'
type DisplayTask = Task & { displayStart: Date; displayEnd: Date }

const BAR_DAYS = 6

function quarterRanges(year: number) {
  return [
    { label: 'Q1 (ינו–מרץ)', start: new Date(year, 0, 1),  end: new Date(year, 2, 31) },
    { label: 'Q2 (אפר–יון)', start: new Date(year, 3, 1),  end: new Date(year, 5, 30) },
    { label: 'Q3 (יול–ספט)', start: new Date(year, 6, 1),  end: new Date(year, 8, 30) },
    { label: 'Q4 (אוק–דצמ)', start: new Date(year, 9, 1),  end: new Date(year, 11, 31) },
  ]
}

function expandForYear(t: Task, year: number): DisplayTask[] {
  if (!t.endDate) return []
  const end = t.endDate.toDate()
  const start = t.startDate?.toDate() ?? end
  const qr = quarterRanges(year)
  switch (t.frequency) {
    case 'חד-פעמי':
      if (end.getFullYear() !== year) return []
      return [{ ...t, displayStart: start, displayEnd: end }]
    case 'חודשי':
    case 'שוטף':
      return [{ ...t, displayStart: new Date(year, 0, 1), displayEnd: new Date(year, 11, 31) }]
    case 'רבעוני':
      return qr.map(q => ({ ...t, displayStart: q.start, displayEnd: q.end }))
    case 'חצי-שנתי':
      return [
        { ...t, displayStart: new Date(year, 0, 1), displayEnd: new Date(year, 5, 30) },
        { ...t, displayStart: new Date(year, 6, 1), displayEnd: new Date(year, 11, 31) },
      ]
    case 'שנתי':
    case 'לפי חג':
      return [{ ...t, displayStart: new Date(year, end.getMonth(), 1), displayEnd: new Date(year, end.getMonth() + 1, 0) }]
    default:
      return [{ ...t, displayStart: start, displayEnd: end }]
  }
}

function expandForMonthly(t: Task, year: number): DisplayTask[] {
  if (!t.endDate) return []
  const end = t.endDate.toDate()
  const start = t.startDate?.toDate() ?? end
  switch (t.frequency) {
    case 'חד-פעמי':
      if (end.getFullYear() !== year) return []
      return [{ ...t, displayStart: start, displayEnd: end }]
    case 'חודשי':
    case 'שוטף': {
      const dom = Math.min(end.getDate(), 28)
      return Array.from({ length: 12 }, (_, m) => ({
        ...t,
        displayStart: new Date(year, m, dom),
        displayEnd: new Date(year, m, dom + BAR_DAYS),
      }))
    }
    case 'רבעוני': {
      const dom = Math.min(end.getDate(), 28)
      return [2, 5, 8, 11].map(m => ({
        ...t,
        displayStart: new Date(year, m, dom),
        displayEnd: new Date(year, m, dom + BAR_DAYS),
      }))
    }
    case 'חצי-שנתי': {
      const dom = Math.min(end.getDate(), 28)
      return [5, 11].map(m => ({
        ...t,
        displayStart: new Date(year, m, dom),
        displayEnd: new Date(year, m, dom + BAR_DAYS),
      }))
    }
    case 'שנתי':
    case 'לפי חג': {
      const m = end.getMonth()
      const dom = Math.min(end.getDate(), 28)
      return [{ ...t, displayStart: new Date(year, m, dom), displayEnd: new Date(year, m, dom + BAR_DAYS) }]
    }
    default:
      return [{ ...t, displayStart: start, displayEnd: end }]
  }
}

function expandForSingleMonth(t: Task, year: number, month: number): DisplayTask[] {
  if (!t.endDate) return []
  const end = t.endDate.toDate()
  const start = t.startDate?.toDate() ?? end
  const mStart = new Date(year, month, 1)
  const mEnd = new Date(year, month + 1, 0)

  switch (t.frequency) {
    case 'חד-פעמי': {
      const ds = start < mStart ? mStart : start
      const de = end > mEnd ? mEnd : end
      if (ds > de) return []
      return [{ ...t, displayStart: ds, displayEnd: de }]
    }
    default: {
      const dom = Math.min(end.getDate(), mEnd.getDate())
      const barStart = new Date(year, month, dom)
      const barEnd = new Date(year, month, Math.min(dom + BAR_DAYS, mEnd.getDate()))
      return [{ ...t, displayStart: barStart, displayEnd: barEnd }]
    }
  }
}

interface Props {
  tasks: Task[]
  singleMonth?: Date
}

export function GanttView({ tasks, singleMonth }: Props) {
  const navigate = useNavigate()
  const { appUser } = useAuth()
  const [filterMode, setFilterMode] = useState<FilterMode>('domain')
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('monthly')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const [myTasksOnly, setMyTasksOnly] = useState(true)

  const baseTasks = useMemo(() => {
    const topLevel = tasks.filter(t => !t.parentTaskId)
    if (!myTasksOnly || !appUser?.name) return topLevel
    return topLevel.filter(t =>
      t.responsible === appUser.name || (t.involved ?? []).includes(appUser.name)
    )
  }, [tasks, myTasksOnly, appUser])

  const year = singleMonth ? singleMonth.getFullYear() : selectedYear
  const month = singleMonth ? singleMonth.getMonth() : 0

  const allDisplayTasks = useMemo<DisplayTask[]>(() => {
    const result: DisplayTask[] = []
    if (singleMonth) {
      for (const t of baseTasks) result.push(...expandForSingleMonth(t, year, month))
    } else if (timelineMode === 'monthly') {
      for (const t of baseTasks) result.push(...expandForMonthly(t, year))
    } else {
      for (const t of baseTasks) result.push(...expandForYear(t, year))
    }
    return result.sort((a, b) => a.displayStart.getTime() - b.displayStart.getTime())
  }, [baseTasks, singleMonth, timelineMode, year, month])

  const tasksWithDates = useMemo(() => baseTasks.filter(t => t.endDate), [baseTasks])

  const persons = useMemo(
    () => [...new Set(tasksWithDates.map(t => t.responsible).filter(r => r.length > 0))].sort(),
    [tasksWithDates]
  )

  const displayTasks = useMemo(() => {
    let result = allDisplayTasks
    if (filterMode === 'domain' && selectedDomain) result = result.filter(t => t.domain === selectedDomain)
    if (filterMode === 'person' && selectedPerson) result = result.filter(t => t.responsible === selectedPerson)
    return result
  }, [allDisplayTasks, filterMode, selectedDomain, selectedPerson])

  if (allDisplayTasks.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
        {singleMonth
          ? `אין משימות לחודש ${singleMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}`
          : `אין משימות עם תאריכי יעד בשנת ${year}`}
      </div>
    )
  }

  // Time range
  const minDate = singleMonth
    ? new Date(year, month, 1)
    : new Date(year, 0, 1)
  const maxDate = singleMonth
    ? new Date(year, month + 1, 0)
    : new Date(year, 11, 31)

  const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
  const pct = (d: Date) => Math.max(0, Math.min(100, (d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24) / totalDays * 100))
  const bw  = (s: Date, e: Date) => Math.max(0.5, (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24) / totalDays * 100)

  const today = new Date()
  const todayPct = pct(today)
  const showToday = today >= minDate && today <= maxDate

  // Column headers
  const colHeaders: { label: string; left: number; width: number }[] = []
  if (singleMonth) {
    // Week columns
    let weekStart = new Date(year, month, 1)
    const mEnd = new Date(year, month + 1, 0)
    while (weekStart <= mEnd) {
      const weekEnd = new Date(Math.min(
        new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6).getTime(),
        mEnd.getTime()
      ))
      colHeaders.push({
        label: `${weekStart.getDate()}–${weekEnd.getDate()}`,
        left: pct(weekStart),
        width: bw(weekStart, weekEnd),
      })
      weekStart = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() + 1)
    }
  } else if (timelineMode === 'quarterly') {
    for (const q of quarterRanges(year)) {
      colHeaders.push({ label: q.label, left: pct(q.start), width: bw(q.start, q.end) })
    }
  } else {
    const cur = new Date(minDate); cur.setDate(1)
    while (cur <= maxDate) {
      const ms = new Date(Math.max(cur.getTime(), minDate.getTime()))
      const me = new Date(Math.min(new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getTime(), maxDate.getTime()))
      colHeaders.push({ label: cur.toLocaleDateString('he-IL', { month: 'short' }), left: pct(ms), width: bw(ms, me) })
      cur.setMonth(cur.getMonth() + 1)
    }
  }

  const TaskBarRow = ({ t, idx }: { t: DisplayTask; idx: number }) => {
    const color = DOMAIN_COLORS[t.domain]
    const bLeft = pct(t.displayStart)
    const bWidth = bw(t.displayStart, t.displayEnd)
    return (
      <div
        className="flex items-center border-b border-gray-50 h-10 hover:bg-gray-50 group cursor-pointer"
        onClick={() => navigate(`/tasks/${t.id}`)}
        style={{ backgroundColor: idx % 2 === 0 ? undefined : 'rgba(0,0,0,0.01)' }}
      >
        <div className="w-[30%] px-3 shrink-0 border-l border-gray-100 flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
            title={DOMAIN_LABELS[t.domain]}
          />
          <div className="min-w-0">
            <div className="text-xs truncate group-hover:underline" style={{ color: '#141348' }}>{t.title}</div>
            <div className="text-xs truncate" style={{ color: '#8A9A9A' }}>{t.responsible}</div>
          </div>
        </div>
        <div className="flex-1 relative h-full">
          <div
            className="absolute top-2 h-6 rounded opacity-80 group-hover:opacity-100 transition-opacity"
            style={{ right: `${bLeft}%`, width: `${bWidth}%`, minWidth: '4px', backgroundColor: color }}
            title={t.title}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* My tasks toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => setMyTasksOnly(false)}
            className={`px-3 py-1.5 transition-colors ${!myTasksOnly ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >כל המשימות</button>
          <button
            onClick={() => setMyTasksOnly(true)}
            className={`px-3 py-1.5 transition-colors border-r border-gray-200 ${myTasksOnly ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >המשימות שלי</button>
        </div>

        {/* Timeline controls — hidden in single-month mode */}
        {!singleMonth && (
          <>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setTimelineMode('monthly')}
                className={`px-3 py-1.5 font-medium transition-colors ${timelineMode === 'monthly' ? 'bg-brand-teal text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >חודשי</button>
              <button
                onClick={() => setTimelineMode('quarterly')}
                className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 ${timelineMode === 'quarterly' ? 'bg-brand-teal text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >רבעוני</button>
            </div>

            <div className="flex items-center gap-1 text-xs">
              <button onClick={() => setSelectedYear(y => y - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500">←</button>
              <span className="font-bold px-1" style={{ color: '#141348' }}>{selectedYear}</span>
              <button onClick={() => setSelectedYear(y => y + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500">→</button>
            </div>
          </>
        )}

        {/* Filter mode toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => { setFilterMode('domain'); setSelectedPerson(null) }}
            className={`px-3 py-1.5 transition-colors ${filterMode === 'domain' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-50'}`}
          >סנן לפי תחום</button>
          <button
            onClick={() => { setFilterMode('person'); setSelectedDomain(null) }}
            className={`px-3 py-1.5 transition-colors border-r border-gray-200 ${filterMode === 'person' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-50'}`}
          >סנן לפי אחראי</button>
        </div>

        {/* Domain chips */}
        {filterMode === 'domain' && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedDomain(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${!selectedDomain ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >הכל</button>
            {DOMAINS.filter(d => tasksWithDates.some(t => t.domain === d)).map(d => {
              const bg = DOMAIN_COLORS[d]
              const isActive = selectedDomain === d
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDomain(isActive ? null : d)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity"
                  style={{ backgroundColor: bg, color: getTextColor(bg), opacity: isActive || !selectedDomain ? 1 : 0.45, outline: isActive ? '2px solid #141348' : undefined, outlineOffset: '2px' }}
                >{DOMAIN_LABELS[d]} ({tasksWithDates.filter(t => t.domain === d).length})</button>
              )
            })}
          </div>
        )}

        {/* Person chips */}
        {filterMode === 'person' && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedPerson(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${!selectedPerson ? 'bg-brand-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >הכל ({tasksWithDates.length})</button>
            {persons.map(person => (
              <button
                key={person}
                onClick={() => setSelectedPerson(selectedPerson === person ? null : person)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${selectedPerson === person ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >{person} ({tasksWithDates.filter(t => t.responsible === person).length})</button>
            ))}
          </div>
        )}
      </div>

      {/* Chart — single unified Gantt */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
        <div className="min-w-[900px] relative">
          {/* Column header row */}
          <div className="relative h-8 border-b border-gray-100" style={{ backgroundColor: '#E6F4F4' }}>
            <div className="absolute right-0 w-[30%] h-full border-l border-gray-200 flex items-center px-3">
              <span className="text-xs font-medium" style={{ color: '#3A3A6B' }}>
                {singleMonth
                  ? singleMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
                  : 'משימה / אחראי'}
              </span>
            </div>
            <div className="absolute" style={{ right: '30%', left: 0, top: 0, bottom: 0 }}>
              {colHeaders.map((h, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex items-center px-2 text-xs border-r border-gray-200"
                  style={{ right: `${h.left}%`, width: `${h.width}%`, color: '#3A3A6B' }}
                >{h.label}</div>
              ))}
            </div>
          </div>

          {/* Today line */}
          {showToday && (
            <div
              className="absolute top-8 bottom-0 w-px z-10 pointer-events-none"
              style={{ right: `calc(${30 + todayPct * 0.7}%)`, backgroundColor: '#EF4444', opacity: 0.6 }}
              title="היום"
            />
          )}

          {/* Flat task list — all on one Gantt */}
          {displayTasks.map((t, i) => <TaskBarRow key={`${t.id}-${i}`} t={t} idx={i} />)}

          {displayTasks.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">אין משימות להצגה</div>
          )}
        </div>
      </div>
    </div>
  )
}
