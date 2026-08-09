import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '../../types'
import { DOMAIN_COLORS } from '../../types'
import { getTextColor } from '../../utils/color'

export function GanttView({ tasks }: { tasks: Task[] }) {
  const navigate = useNavigate()
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)

  const tasksWithDates = useMemo(
    () =>
      tasks
        .filter((t) => t.startDate && t.endDate)
        .sort((a, b) => a.startDate!.toDate().getTime() - b.startDate!.toDate().getTime()),
    [tasks]
  )

  const persons = useMemo(
    () => [...new Set(tasksWithDates.map((t) => t.responsible).filter((r) => r))].sort(),
    [tasksWithDates]
  )

  const displayTasks = useMemo(
    () =>
      selectedPerson
        ? tasksWithDates.filter((t) => t.responsible === selectedPerson)
        : tasksWithDates,
    [tasksWithDates, selectedPerson]
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
  const barWidth = (start: Date, end: Date) => {
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0.5, (days / totalDays) * 100)
  }

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
      width: barWidth(mStart, mEndClamped),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  return (
    <div className="space-y-3">
      {/* Person filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedPerson(null)}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
            !selectedPerson
              ? 'bg-brand-teal text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          הכל ({tasksWithDates.length})
        </button>
        {persons.map((person) => {
          const count = tasksWithDates.filter((t) => t.responsible === person).length
          return (
            <button
              key={person}
              onClick={() => setSelectedPerson(selectedPerson === person ? null : person)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedPerson === person
                  ? 'bg-brand-navy text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {person} ({count})
            </button>
          )
        })}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
        <div className="min-w-[900px]">
          {/* Month header */}
          <div className="relative h-8 border-b border-gray-100" style={{ backgroundColor: '#E6F4F4' }}>
            {months.map((m, i) => (
              <div
                key={i}
                className="absolute top-0 h-full flex items-center px-2 text-xs border-r border-gray-200"
                style={{ left: `${m.left + 20}%`, width: `${m.width}%`, color: '#3A3A6B' }}
              >
                {m.label}
              </div>
            ))}
            <div className="absolute right-0 w-1/5 h-full border-l border-gray-200" />
          </div>

          {/* Grouped rows */}
          {byPerson.map(({ person, personTasks }) => (
            <div key={person}>
              {/* Person header */}
              <div
                className="flex items-center h-9 border-b border-gray-200"
                style={{ backgroundColor: '#f8f9fa' }}
              >
                <div
                  className="w-1/5 px-3 text-xs font-semibold truncate shrink-0 border-l border-gray-200"
                  style={{ color: '#141348' }}
                >
                  👤 {person}
                </div>
                <div className="flex-1 px-3 text-xs text-gray-400">
                  {personTasks.length} משימות
                </div>
              </div>
              {/* Task rows */}
              {personTasks.map((t) => {
                const s = t.startDate!.toDate()
                const e = t.endDate!.toDate()
                const color = DOMAIN_COLORS[t.domain]
                const bLeft = pct(s)
                const bWidth = barWidth(s, e)
                return (
                  <div
                    key={t.id}
                    className="flex items-center border-b border-gray-50 h-10 hover:bg-gray-50 group"
                  >
                    <div
                      className="w-1/5 px-3 text-xs truncate shrink-0 border-l border-gray-100"
                      style={{ color: '#141348' }}
                    >
                      {t.title}
                    </div>
                    <div className="flex-1 relative h-full">
                      <div
                        className="absolute top-2 h-6 rounded cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden"
                        style={{
                          left: `${bLeft}%`,
                          width: `${bWidth}%`,
                          minWidth: '4px',
                          backgroundColor: color,
                        }}
                        onClick={() => navigate(`/tasks/${t.id}`)}
                        title={t.title}
                      >
                        <span
                          className="text-xs truncate"
                          style={{ color: getTextColor(color) }}
                        >
                          {bWidth > 5 ? t.title : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {displayTasks.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              אין משימות עם תאריכים לאדם זה
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
