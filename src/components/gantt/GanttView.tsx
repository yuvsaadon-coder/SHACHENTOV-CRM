import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task, Domain } from '../../types'
import { DOMAIN_COLORS, DOMAIN_LABELS, DOMAINS } from '../../types'
import { getTextColor } from '../../utils/color'

type TimelineMode = 'yearly' | 'halfyear' | 'quarterly'
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

function expandForHalfYear(t: Task, year: number, half: 1 | 2): DisplayTask[] {
  if (!t.endDate) return []
  const end = t.endDate.toDate()
  const halfStartMonth = half === 1 ? 0 : 6
  const halfEndMonth  = half === 1 ? 5 : 11
  switch (t.frequency) {
    case 'חד-פעמי': {
      if (end.getFullYear() !== year) return []
      const m = end.getMonth()
      if (m < halfStartMonth || m > halfEndMonth) return []
      const start = t.startDate?.toDate() ?? end
      return [{ ...t, displayStart: start, displayEnd: end }]
    }
    case 'חודשי':
    case 'שוטף': {
      const dom = Math.min(end.getDate(), 28)
      return Array.from({ length: 6 }, (_, i) => ({
        ...t,
        displayStart: new Date(year, halfStartMonth + i, dom),
        displayEnd:   new Date(year, halfStartMonth + i, dom + BAR_DAYS),
      }))
    }
    case 'רבעוני': {
      const dom = Math.min(end.getDate(), 28)
      const months = half === 1 ? [2, 5] : [8, 11]
      return months.map(m => ({
        ...t,
        displayStart: new Date(year, m, dom),
        displayEnd:   new Date(year, m, dom + BAR_DAYS),
      }))
    }
    case 'חצי-שנתי': {
      const dom = Math.min(end.getDate(), 28)
      return [{ ...t, displayStart: new Date(year, halfEndMonth, dom), displayEnd: new Date(year, halfEndMonth, dom + BAR_DAYS) }]
    }
    case 'שנתי':
    case 'לפי חג': {
      const m = end.getMonth()
      if (m < halfStartMonth || m > halfEndMonth) return []
      const dom = Math.min(end.getDate(), 28)
      return [{ ...t, displayStart: new Date(year, m, dom), displayEnd: new Date(year, m, dom + BAR_DAYS) }]
    }
    default: {
      const start = t.startDate?.toDate() ?? end
      return [{ ...t, displayStart: start, displayEnd: end }]
    }
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
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('yearly')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedHalf, setSelectedHalf] = useState<1 | 2>(new Date().getMonth() < 6 ? 1 : 2)
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)

  const baseTasks = useMemo(() => tasks.filter(t => !t.parentTaskId), [tasks])

  const year  = singleMonth ? singleMonth.getFullYear() : selectedYear
  const month = singleMonth ? singleMonth.getMonth()    : 0

  const allDisplayTasks = useMemo<DisplayTask[]>(() => {
    const result: DisplayTask[] = []
    if (singleMonth) {
      for (const t of baseTasks) result.push(...expandForSingleMonth(t, year, month))
    } else if (timelineMode === 'yearly') {
      for (const t of baseTasks) result.push(...expandForMonthly(t, year))
    } else if (timelineMode === 'halfyear') {
      for (const t of baseTasks) result.push(...expandForHalfYear(t, year, selectedHalf))
    } else {
      for (const t of baseTasks) result.push(...expandForYear(t, year))
    }
    return result.sort((a, b) => a.displayStart.getTime() - b.displayStart.getTime())
  }, [baseTasks, singleMonth, timelineMode, year, month, selectedHalf])

  const tasksWithDates = useMemo(() => baseTasks.filter(t => t.endDate), [baseTasks])

  const displayTasks = useMemo(() => {
    if (selectedDomain) return allDisplayTasks.filter(t => t.domain === selectedDomain)
    return allDisplayTasks
  }, [allDisplayTasks, selectedDomain])

  // ── Domain chip strip (shared by both layouts) ──────────────────────────────
  const DomainChips = () => (
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
  )

  // ── singleMonth: week-column layout ─────────────────────────────────────────
  if (singleMonth) {
    const mEnd = new Date(year, month + 1, 0)
    const weeks: { startDay: number; endDay: number; label: string }[] = []
    let d = 1
    while (d <= mEnd.getDate()) {
      const e = Math.min(d + 6, mEnd.getDate())
      weeks.push({ startDay: d, endDay: e, label: `${d}–${e}` })
      d = e + 1
    }

    const tasksByWeek = new Map<number, DisplayTask[]>()
    weeks.forEach((_, i) => tasksByWeek.set(i, []))
    displayTasks.forEach(t => {
      const day = t.displayStart.getDate()
      const wi = weeks.findIndex(w => day >= w.startDay && day <= w.endDay)
      if (wi >= 0) tasksByWeek.get(wi)!.push(t)
    })

    if (allDisplayTasks.length === 0) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          {`אין משימות לחודש ${singleMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}`}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <DomainChips />
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
          <div className="grid min-w-[480px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
            {weeks.map((w, wi) => (
              <div key={wi} className="border-l border-gray-100 first:border-l-0">
                <div
                  className="text-xs font-semibold text-center py-2 border-b border-gray-100"
                  style={{ backgroundColor: '#E6F4F4', color: '#3A3A6B' }}
                >
                  {w.label}
                </div>
                <div className="p-2 space-y-1.5 min-h-[60px]">
                  {(tasksByWeek.get(wi) ?? []).map((t, i) => (
                    <button
                      key={`${t.id}-${i}`}
                      onClick={() => navigate(`/tasks/${t.id}`)}
                      className="w-full text-right px-2 py-1.5 rounded-lg text-xs hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: DOMAIN_COLORS[t.domain] + '22',
                        borderRight: `3px solid ${DOMAIN_COLORS[t.domain]}`,
                      }}
                    >
                      <div className="font-medium truncate" style={{ color: '#141348' }}>{t.title}</div>
                      <div className="text-[10px]" style={{ color: DOMAIN_COLORS[t.domain] }}>{DOMAIN_LABELS[t.domain]}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Non-singleMonth: regular Gantt ───────────────────────────────────────────

  if (allDisplayTasks.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
        {`אין משימות עם תאריכי יעד בשנת ${year}`}
      </div>
    )
  }

  const minDate = timelineMode === 'halfyear'
    ? new Date(year, selectedHalf === 1 ? 0 : 6, 1)
    : new Date(year, 0, 1)
  const maxDate = timelineMode === 'halfyear'
    ? new Date(year, selectedHalf === 1 ? 5 : 11, selectedHalf === 1 ? 30 : 31)
    : new Date(year, 11, 31)

  const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
  const pct = (date: Date) => Math.max(0, Math.min(100, (date.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24) / totalDays * 100))
  const bw  = (s: Date, e: Date) => Math.max(0.5, (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24) / totalDays * 100)

  const today = new Date()
  const todayPct = pct(today)
  const showToday = today >= minDate && today <= maxDate

  const colHeaders: { label: string; left: number; width: number }[] = []
  if (timelineMode === 'quarterly') {
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
    const bLeft  = pct(t.displayStart)
    const bWidth = bw(t.displayStart, t.displayEnd)
    return (
      <div
        className="flex items-center border-b border-gray-50 h-10 hover:bg-gray-50 group cursor-pointer"
        onClick={() => navigate(`/tasks/${t.id}`)}
        style={{ backgroundColor: idx % 2 === 0 ? undefined : 'rgba(0,0,0,0.01)' }}
      >
        <div className="w-[30%] px-3 shrink-0 border-l border-gray-100 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} title={DOMAIN_LABELS[t.domain]} />
          <div className="text-xs truncate group-hover:underline" style={{ color: '#141348' }}>{t.title}</div>
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

  const periodLabel = timelineMode === 'halfyear'
    ? `${selectedHalf === 1 ? 'ינואר–יוני' : 'יולי–דצמבר'} ${selectedYear}`
    : `${selectedYear}`

  const prevPeriod = () => {
    if (timelineMode === 'halfyear') {
      if (selectedHalf === 1) { setSelectedYear(y => y - 1); setSelectedHalf(2) }
      else setSelectedHalf(1)
    } else {
      setSelectedYear(y => y - 1)
    }
  }
  const nextPeriod = () => {
    if (timelineMode === 'halfyear') {
      if (selectedHalf === 2) { setSelectedYear(y => y + 1); setSelectedHalf(1) }
      else setSelectedHalf(2)
    } else {
      setSelectedYear(y => y + 1)
    }
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(['yearly', 'halfyear', 'quarterly'] as const).map((m, i) => (
            <button
              key={m}
              onClick={() => setTimelineMode(m)}
              className={`px-3 py-1.5 font-medium transition-colors ${i > 0 ? 'border-r border-gray-200' : ''} ${timelineMode === m ? 'bg-brand-teal text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {m === 'yearly' ? 'שנה' : m === 'halfyear' ? 'חצי שנה' : 'רבעוני'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <button onClick={prevPeriod} className="p-1 rounded hover:bg-gray-100 text-gray-500">←</button>
          <span className="font-bold px-1" style={{ color: '#141348' }}>{periodLabel}</span>
          <button onClick={nextPeriod} className="p-1 rounded hover:bg-gray-100 text-gray-500">→</button>
        </div>

        <DomainChips />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
        <div className="min-w-[900px] relative">
          {/* Column header row */}
          <div className="relative h-8 border-b border-gray-100" style={{ backgroundColor: '#E6F4F4' }}>
            <div className="absolute right-0 w-[30%] h-full border-l border-gray-200 flex items-center px-3">
              <span className="text-xs font-medium" style={{ color: '#3A3A6B' }}>משימה</span>
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

          {displayTasks.map((t, i) => <TaskBarRow key={`${t.id}-${i}`} t={t} idx={i} />)}

          {displayTasks.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">אין משימות להצגה</div>
          )}
        </div>
      </div>
    </div>
  )
}
