import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '../../types'
import { DOMAIN_COLORS } from '../../types'

export function GanttView({ tasks }: { tasks: Task[] }) {
  const navigate = useNavigate()

  const tasksWithDates = useMemo(
    () => tasks.filter((t) => t.startDate && t.endDate).sort(
      (a, b) => a.startDate!.toDate().getTime() - b.startDate!.toDate().getTime()
    ),
    [tasks]
  )

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

  const pct = (date: Date) => {
    const d = (date.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0, Math.min(100, (d / totalDays) * 100))
  }

  const width = (start: Date, end: Date) => {
    const d = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0.5, (d / totalDays) * 100)
  }

  // Month headers
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
      width: width(mStart, mEndClamped),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
      <div className="min-w-[900px]">
        {/* Header: month labels */}
        <div className="relative h-8 border-b border-gray-100 bg-brand-teal050">
          {months.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 h-full flex items-center px-2 text-xs text-brand-navy2 border-r border-gray-200"
              style={{ left: `${m.left + 20}%`, width: `${m.width}%` }}
            >
              {m.label}
            </div>
          ))}
          <div className="absolute right-0 w-1/5 h-full border-l border-gray-200" />
        </div>

        {/* Rows */}
        {tasksWithDates.map((t) => {
          const s = t.startDate!.toDate()
          const e = t.endDate!.toDate()
          const color = DOMAIN_COLORS[t.domain]
          const barLeft = pct(s)
          const barWidth = width(s, e)
          return (
            <div key={t.id} className="flex items-center border-b border-gray-50 h-10 hover:bg-gray-50 group">
              {/* Label on the right (RTL: start) */}
              <div className="w-1/5 px-3 text-xs text-brand-navy truncate shrink-0 border-l border-gray-100">
                {t.title}
              </div>
              {/* Bar */}
              <div className="flex-1 relative h-full">
                <div
                  className="absolute top-2 h-6 rounded cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden"
                  style={{
                    left: `${barLeft}%`,
                    width: `${barWidth}%`,
                    minWidth: '4px',
                    backgroundColor: color,
                  }}
                  onClick={() => navigate(`/tasks/${t.id}`)}
                  title={t.title}
                >
                  <span className="text-white text-xs truncate">{barWidth > 5 ? t.title : ''}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
