import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task, Domain } from '../../types'
import { DOMAIN_COLORS, DOMAIN_LABELS, DOMAINS } from '../../types'
import { getTextColor } from '../../utils/color'

type GroupMode = 'domain' | 'person'
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

export function GanttView({ tasks }: { tasks: Task[] }) {
  const navigate = useNavigate()
  const [groupBy, setGroupBy] = useState<GroupMode>('domain')
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('monthly')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)

  const tasksForMonthly = useMemo<DisplayTask[]>(() => {
    const result: DisplayTask[] = []
    for (const t of tasks) result.push(...expandForMonthly(t, selectedYear))
    return result.sort((a, b) => a.displayStart.getTime() - b.displayStart.getTime())
  }, [tasks, selectedYear])

  const tasksForQuarterly = useMemo<DisplayTask[]>(() => {
    const result: DisplayTask[] = []
    for (const t of tasks) result.push(...expandForYear(t, selectedYear))
    return result.sort((a, b) => a.displayStart.getTime() - b.displayStart.getTime())
  }, [tasks, selectedYear])

  const allDisplayTasks = timelineMode === 'monthly' ? tasksForMonthly : tasksForQuarterly

  const displayTasks = useMemo(() => {
    if (groupBy === 'domain' && selectedDomain) return allDisplayTasks.filter(t => t.domain === selectedDomain)
    if (groupBy === 'person' && selectedPerson) return allDisplayTasks.filter(t => t.responsible === selectedPerson)
    return allDisplayTasks
  }, [allDisplayTasks, groupBy, selectedDomain, selectedPerson])

  const tasksWithDates = useMemo(() => tasks.filter(t => t.endDate), [tasks])

  const persons = useMemo(
    () => [...new Set(tasksWithDates.map(t => t.responsible).filter(r => r.length > 0))].sort(),
    [tasksWithDates]
  )

  const byDomain = useMemo(() =>
    DOMAINS
      .map(domain => ({
        domain,
        color: DOMAIN_COLORS[domain],
        label: DOMAIN_LABELS[domain],
        domainTasks: displayTasks.filter(t => t.domain === domain),
      }))
      .filter(g => g.domainTasks.length > 0),
    [displayTasks]
  )

  const byPerson = useMemo(() => {
    const map = new Map<string, DisplayTask[]>()
    for (const t of displayTasks) {
      if (!t.responsible) continue
      if (!map.has(t.responsible)) map.set(t.responsible, [])
      map.get(t.responsible)!.push(t)
    }
    return [...map.entries()].map(([person, personTasks]) => ({ person, personTasks }))
  }, [displayTasks])

  if (allDisplayTasks.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
        {`אין משימות עם תאריכי יעד בשנת ${selectedYear}`}
      </div>
    )
  }

  const today = new Date()
  const minDate = new Date(selectedYear, 0, 1)
  const maxDate = new Date(selectedYear, 11, 31)

  const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
  const pct = (d: Date) => Math.max(0, Math.min(100, (d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24) / totalDays * 100))
  const bw  = (s: Date, e: Date) => Math.max(0.5, (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24) / totalDays * 100)

  const todayPct = pct(today)
  const showToday = today >= minDate && today <= maxDate

  const colHeaders: { label: string; left: number; width: number }[] = []
  if (timelineMode === 'quarterly') {
    for (const q of quarterRanges(selectedYear)) {
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

  const TaskBarRow = ({ t }: { t: DisplayTask }) => {
    const color = DOMAIN_COLORS[t.domain]
    const bLeft = pct(t.displayStart)
    const bWidth = bw(t.displayStart, t.displayEnd)
    return (
      <div className="flex items-center border-b border-gray-50 h-10 hover:bg-gray-50 group">
        <div className="w-[30%] px-3 shrink-0 border-l border-gray-100">
          <div className="text-xs truncate" style={{ color: '#141348' }}>{t.title}</div>
          <div className="text-xs truncate" style={{ color: '#8A9A9A' }}>{t.responsible}</div>
        </div>
        <div className="flex-1 relative h-full">
          <div
            className="absolute top-2 h-6 rounded cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden"
            style={{ right: `${bLeft}%`, width: `${bWidth}%`, minWidth: '4px', backgroundColor: color }}
            onClick={() => navigate(`/tasks/${t.id}`)}
            title={t.title}
          >
            <span className="text-xs truncate" style={{ color: getTextColor(color) }}>
              {bWidth > 6 ? t.title : ''}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Group toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => { setGroupBy('domain'); setSelectedPerson(null) }}
            className={`px-3 py-1.5 font-medium transition-colors ${groupBy === 'domain' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >לפי תחום</button>
          <button
            onClick={() => { setGroupBy('person'); setSelectedDomain(null) }}
            className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 ${groupBy === 'person' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >לפי אחראי</button>
        </div>

        {/* Timeline toggle */}
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

        {/* Year navigation — both modes */}
        <div className="flex items-center gap-1 text-xs">
          <button onClick={() => setSelectedYear(y => y - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500">←</button>
          <span className="font-bold px-1" style={{ color: '#141348' }}>{selectedYear}</span>
          <button onClick={() => setSelectedYear(y => y + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500">→</button>
        </div>

        {/* Domain chips */}
        {groupBy === 'domain' && (
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
        {groupBy === 'person' && (
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

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
        <div className="min-w-[900px] relative">
          {/* Column header row */}
          <div className="relative h-8 border-b border-gray-100" style={{ backgroundColor: '#E6F4F4' }}>
            <div className="absolute right-0 w-[30%] h-full border-l border-gray-200 flex items-center px-3">
              <span className="text-xs font-medium" style={{ color: '#3A3A6B' }}>משימה / אחראי</span>
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

          {/* Today line — right: 30% + todayPct×0.7% aligns with bar area RTL positioning */}
          {showToday && (
            <div
              className="absolute top-8 bottom-0 w-px z-10 pointer-events-none"
              style={{ right: `calc(${30 + todayPct * 0.7}%)`, backgroundColor: '#EF4444', opacity: 0.6 }}
              title="היום"
            />
          )}

          {/* Domain groups */}
          {groupBy === 'domain' && byDomain.map(({ domain, color, label, domainTasks }) => (
            <div key={domain}>
              <div className="flex items-center h-9 border-b border-gray-200 px-3" style={{ backgroundColor: color }}>
                <div className="w-[30%] shrink-0 border-l border-white/20">
                  <span className="text-xs font-bold" style={{ color: getTextColor(color) }}>{label}</span>
                </div>
                <div className="flex-1 px-3">
                  <span className="text-xs" style={{ color: getTextColor(color), opacity: 0.75 }}>{domainTasks.length} משימות</span>
                </div>
              </div>
              {domainTasks.map((t, i) => <TaskBarRow key={`${t.id}-${i}`} t={t} />)}
            </div>
          ))}

          {/* Person groups */}
          {groupBy === 'person' && byPerson.map(({ person, personTasks }) => (
            <div key={person}>
              <div className="flex items-center h-9 border-b border-gray-200" style={{ backgroundColor: '#f8f9fa' }}>
                <div className="w-[30%] px-3 shrink-0 border-l border-gray-200 text-xs font-semibold truncate" style={{ color: '#141348' }}>
                  👤 {person}
                </div>
                <div className="flex-1 px-3 text-xs text-gray-400">{personTasks.length} משימות</div>
              </div>
              {personTasks.map((t, i) => <TaskBarRow key={`${t.id}-${i}`} t={t} />)}
            </div>
          ))}

          {displayTasks.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">אין משימות להצגה</div>
          )}
        </div>
      </div>
    </div>
  )
}
