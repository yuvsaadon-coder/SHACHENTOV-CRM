import { useMemo } from 'react'
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { he } from 'date-fns/locale'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HDate } from '@hebcal/core'
import type { Task } from '../../types'
import { DOMAIN_COLORS } from '../../types'
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

export function CalendarView({ tasks }: { tasks: Task[] }) {
  const [date, setDate] = useState(new Date())
  const [view, setView] = useState<View>('month')
  const navigate = useNavigate()

  const events = useMemo<CalEvent[]>(() => {
    const taskEvents: CalEvent[] = tasks
      .filter((t) => t.endDate)
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.startDate?.toDate() || t.endDate!.toDate(),
        end: t.endDate!.toDate(),
        resource: t,
      }))
    const holidays = getJewishHolidays(date.getFullYear())
    return [...taskEvents, ...holidays]
  }, [tasks, date])

  const eventStyleGetter = (event: CalEvent) => {
    if (event.isHoliday) {
      return { style: { backgroundColor: '#FDC857', color: '#141348', border: 'none', fontSize: '11px' } }
    }
    const color = event.resource ? (DOMAIN_COLORS[event.resource.domain] || '#189A9F') : '#189A9F'
    return { style: { backgroundColor: color, color: getTextColor(color), border: 'none', fontSize: '11px', borderRadius: '4px' } }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4" style={{ height: '70vh' }}>
      <style>{`
        .rbc-calendar { direction: rtl; font-family: Rubik, sans-serif; }
        .rbc-header { color: #141348; font-weight: 500; }
        .rbc-toolbar button { font-family: Rubik, sans-serif; }
        .rbc-today { background-color: #E6F4F4; }
      `}</style>
      <Calendar<CalEvent>
        localizer={localizer}
        events={events}
        date={date}
        view={view}
        onNavigate={setDate}
        onView={setView}
        onSelectEvent={(e) => e.id && navigate(`/tasks/${e.id}`)}
        eventPropGetter={eventStyleGetter}
        messages={{
          today: 'היום', previous: '←', next: '→', month: 'חודש',
          week: 'שבוע', day: 'יום', agenda: 'אג׳נדה', noEventsInRange: 'אין משימות',
        }}
        rtl
      />
    </div>
  )
}
