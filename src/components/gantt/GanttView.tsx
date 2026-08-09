import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task, Domain } from '../../types'
import { DOMAIN_COLORS, DOMAIN_LABELS, DOMAINS } from '../../types'
import { getTextColor } from '../../utils/color'

type GroupMode = 'domain' | 'person'

export function GanttView({ tasks }: { tasks: Task[] }) {
  const navigate = useNavigate()
  const [groupBy, setGroupBy] = useState<GroupMode>('domain')
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)

  const tasksWithDates = useMemo(
    () =>
      tasks
        .filter((t) => t.startDate && t.endDate)
        .sort((a, b) => a.startDate!.toDate().getTime() - b.startDate!.toDate().getTime()),
    [tasks]
  )

  const displayTasks = useMemo(() => {
    if (groupBy === 'domain' && selectedDomain) {
      return tasksWithDates.filter((t) => t.domain === selectedDomain)
    }
    if (groupBy === 'person' && selectedPerson) {
      return tasksWithDates.filter((t) => t.responsible === selectedPerson)
    }
    return tasksWithDates
  }, [tasksWithDates, groupBy, selectedDomain, selectedPerson])

  const persons = useMemo(
    () => [...new Set(tasksWithDates.map((t) => t.responsible).filter(Boolean))].sort(),
    [tasksWithDates]
  )

  const byDomain = useMemo(() =>
    DOMAINS
      .map((domain) => ({
        domain,
        color: DOMAIN_COLORS[domain],
        label: DOMAIN_LABELS[domain],
        domainTasks: displayTasks.filter((t) => t.domain === domain),
      }))
      .filter((g) => g.domainTasks.length > 0),
    [displayTasks]
  )

  const byPerson = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of displayTasks) {
      if (!map.has(t.responsible)) map.set(t.responsible, [])
      map.get(t.responsible)!.push(t)
    }
    return [...map.entries()].map(([person, personTasks]) => ({ person, personTasks }))
  }, [displayTasks])

  if (tasksWithDates.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
        אין משימות עם תאריכים להצגה בגאנט
      </div>
    )
  }

  const minDate = tasksWithDates.reduce(
    (m, t) => (t.startDate!.toDate() < m ? t.startDate!.toDate() : m),
    tasksWithDates[0].startDate!.toDate()
  )
  const maxDate = tasksWithDates.reduce(
    (m, t) => (t.endDate!.toDate() > m ? t.endDate!.toDate() : m),
    tasksWithDates[0].endDate!.toDate()
  )
  const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))

  const pct = (d: Date) => {
    const days = (d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0, Math.min(100, (days / totalDays) * 100))
  }
  const bw = (start: Date, end: Date) => {
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0.5, (days / totalDays) * 100)
  }

  const today = new Date()
  const todayPct = pct(today)
  const showToday = today >= minDate && today <= maxDate

  const months: { label: string; left: number; width: number }[] = []
  const cur = new Date(minDate)
  cur.setDate(1)
  while (cur <= maxDate) {
    const mStart = new Date(Math.max(cur.getTime(), minDate.getTime()))
    const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    const mEndClamped = new Date(Math.min(mEnd.getTime(), maxDate.getTime()))
    months.push({
      label: cur.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' }),
      left: pct(mStart),
      width: bw(mStart, mEndClamped),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  const TaskRow = ({ t }: { t: Task }) => {
    const s = t.startDate!.toDate()
    const e = t.endDate!.toDate()
    const color = DOMAIN_COLORS[t.domain]
    const bLeft = pct(s)
    const bWidth = bw(s, e)
    return (
      <div className="flex items-center border-b border-gray-50 h-10 hover:bg-gray-50 group">
        <div className="w-[30%] px-3 shrink-0 border-l border-gray-100">
          <div className="text-xs truncate" style={{ color: '#141348' }}>{t.title}</div>
          <div className="text-xs truncate" style={{ color: '#8A9A9A' }}>{t.responsible}</div>
        </div>
        <div className="flex-1 relative h-full">
          <div
            className="absolute top-2 h-6 rounded cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden"
            style={{ left: `${bLeft}%`, width: `${bWidth}%`, minWidth: '4px', backgroundColor: color }}
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
      {/* Controls row */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => { setGroupBy('domain'); setSelectedPerson(null) }}
            className={`px-3 py-1.5 font-medium transition-colors ${groupBy === 'domain' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            לפי תחום
          </button>
          <button
            onClick={() => { setGroupBy('person'); setSelectedDomain(null) }}
            className={`px-3 py-1.5 font-medium transition-colors border-r border-gray-200 ${groupBy === 'person' ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            לפי אחראי
          </button>
        </div>

        {/* Filter chips — domain mode */}
        {groupBy === 'domain' && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedDomain(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${!selectedDomain ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              הכל
            </button>
            {DOMAINS.filter((d) => tasksWithDates.some((t) => t.domain === d)).map((d) => {
              const bg = DOMAIN_COLORS[d]
              const isActive = selectedDomain === d
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDomain(isActive ? null : d)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity"
                  style={{
                    backgroundColor: bg,
                    color: getTextColor(bg),
                    opacity: isActive || !selectedDomain ? 1 : 0.45,
                    outline: isActive ? '2px solid #141348' : undefined,
                    outlineOffset: '2px',
                  }}
                >
                  {DOMAIN_LABELS[d]} ({tasksWithDates.filter((t) => t.domain === d).length})
                </button>
              )
            })}
          </div>
        )}

        {/* Filter chips — person mode */}
        {groupBy === 'person' && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedPerson(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${!selectedPerson ? 'bg-brand-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              הכל ({tasksWithDates.length})
            </button>
            {persons.map((person) => (
              <button
                key={person}
                onClick={() => setSelectedPerson(selectedPerson === person ? null : person)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${selectedPerson === person ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {person} ({tasksWithDates.filter((t) => t.responsible === person).length})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
        <div className="min-w-[900px] relative">
          {/* Month header */}
          <div className="relative h-8 border-b border-gray-100" style={{ backgroundColor: '#E6F4F4' }}>
            <div className="absolute right-0 w-[30%] h-full border-l border-gray-200 flex items-center px-3">
              <span className="text-xs font-medium" style={{ color: '#3A3A6B' }}>משימה / אחראי</span>
            </div>
            <div className="absolute" style={{ right: '30%', left: 0, top: 0, bottom: 0 }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex items-center px-2 text-xs border-r border-gray-200"
                  style={{ right: `${m.left}%`, width: `${m.width}%`, color: '#3A3A6B' }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Today line overlay */}
          {showToday && (
            <div
              className="absolute top-8 bottom-0 w-px z-10 pointer-events-none"
              style={{ right: `calc(70% - ${todayPct * 0.7}%)`, backgroundColor: '#EF4444', opacity: 0.6 }}
              title="היום"
            />
          )}

          {/* Grouped rows */}
          {groupBy === 'domain' && byDomain.map(({ domain, color, label, domainTasks }) => (
            <div key={domain}>
              <div
                className="flex items-center h-9 border-b border-gray-200 px-3"
                style={{ backgroundColor: color }}
              >
                <div className="w-[30%] shrink-0 border-l border-white/20">
                  <span className="text-xs font-bold" style={{ color: getTextColor(color) }}>
                    {label}
                  </span>
                </div>
                <div className="flex-1 px-3">
                  <span className="text-xs" style={{ color: getTextColor(color), opacity: 0.75 }}>
                    {domainTasks.length} משימות
                  </span>
                </div>
              </div>
              {domainTasks.map((t) => <TaskRow key={t.id} t={t} />)}
            </div>
          ))}

          {groupBy === 'person' && byPerson.map(({ person, personTasks }) => (
            <div key={person}>
              <div className="flex items-center h-9 border-b border-gray-200" style={{ backgroundColor: '#f8f9fa' }}>
                <div className="w-[30%] px-3 shrink-0 border-l border-gray-200 text-xs font-semibold truncate" style={{ color: '#141348' }}>
                  👤 {person}
                </div>
                <div className="flex-1 px-3 text-xs text-gray-400">{personTasks.length} משימות</div>
              </div>
              {personTasks.map((t) => <TaskRow key={t.id} t={t} />)}
            </div>
          ))}

          {displayTasks.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">אין משימות עם תאריכים להצגה</div>
          )}
        </div>
      </div>
    </div>
  )
}
