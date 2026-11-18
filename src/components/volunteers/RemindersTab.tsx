import { useState } from 'react'
import type { Branch } from '../../types'
import { useShifts } from '../../hooks/useShifts'
import { useAssignments, useMarkReminderSent } from '../../hooks/useAssignments'
import { useVolunteerMembers } from '../../hooks/useVolunteerMembers'
import { DEFAULT_REMINDER_TEMPLATE, fillTemplate, formatShiftDate, tomorrowISO, waUrl } from '../../lib/volunteerUtils'
import { useTemplate } from './useTemplate'
import { TemplateEditor } from './TemplateEditor'

interface Props { branch: Branch }

export function RemindersTab({ branch }: Props) {
  const [date, setDate] = useState(tomorrowISO())
  const month = date.slice(0, 7)
  const { shifts, loading } = useShifts(branch.id, month)
  const { assignments } = useAssignments(branch.id, month)
  const { volunteers } = useVolunteerMembers(branch.id)
  const markSent = useMarkReminderSent()
  const [template, setTemplate, resetTemplate] = useTemplate(`vol_reminder_tpl_${branch.id}`, DEFAULT_REMINDER_TEMPLATE)

  const dayShifts = shifts.filter((s) => s.date === date && s.status !== 'cancelled')
  const volById = Object.fromEntries(volunteers.map((v) => [v.id, v]))
  const { dayName, label } = formatShiftDate(date)

  const rows = dayShifts.flatMap((shift) =>
    assignments
      .filter((a) => a.shiftId === shift.id && a.status === 'committed')
      .map((a) => ({ shift, a, vol: volById[a.volunteerId] })),
  )
  const pending = rows.filter((r) => r.vol && !r.vol.optOut && !r.a.reminderSentAt)

  const send = (r: (typeof rows)[number]) => {
    if (!r.vol) return
    const msg = fillTemplate(template, {
      name: r.vol.name,
      branch: branch.name,
      date: `${dayName} ${label}`,
      'shift time': r.shift.startTime,
      time: r.shift.startTime,
      place: r.shift.location,
    })
    window.open(waUrl(r.vol.phone, msg), '_blank', 'noopener,noreferrer')
    void markSent(r.a.id)
  }

  const next = pending[0]

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-3 border border-gray-100">
        <button onClick={() => setDate(tomorrowISO())} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600">מחר</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" dir="ltr" />
        <span className="text-xs text-gray-500 shrink-0">{dayName} {label}</span>
      </div>

      <div className="bg-[#E6F4F4] rounded-xl px-4 py-3 space-y-2">
        <div className="text-xs text-[#189A9F]">
          {rows.length === 0 ? 'אין שיבוצים לתאריך זה' : `נשלחו ${rows.length - pending.length} מתוך ${rows.length} תזכורות`}
        </div>
        <button onClick={() => next && send(next)} disabled={!next}
          className="w-full py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ backgroundColor: '#25D366' }}>
          {next?.vol ? `שלח תזכורת לבא בתור: ${next.vol.name}` : 'כולם קיבלו תזכורת ✓'}
        </button>
      </div>

      <TemplateEditor value={template} onChange={setTemplate} onReset={resetTemplate}
        placeholders={['name', 'branch', 'date', 'shift time', 'place']} />

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">טוען...</div>
      ) : dayShifts.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">אין חלוקות בתאריך זה</div>
      ) : (
        dayShifts.map((shift) => {
          const mine = rows.filter((r) => r.shift.id === shift.id)
          return (
            <div key={shift.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" style={{ color: '#141348' }}>{shift.startTime}–{shift.endTime}</div>
                  <div className="text-xs text-gray-500">{shift.location}</div>
                </div>
                <span className="text-xs text-gray-500">{mine.length}/{shift.capacity}</span>
              </div>
              {mine.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-3">אין משובצים</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {mine.map((r) => {
                    const sent = !!r.a.reminderSentAt
                    const sentAt = r.a.reminderSentAt?.toDate?.().toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={r.a.id} className="flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate" style={{ color: '#141348' }}>{r.vol?.name ?? r.a.volunteerId}</div>
                          <div className="text-xs" style={{ color: sent ? '#16A34A' : r.vol?.optOut ? '#DC2626' : '#9CA3AF' }}>
                            {r.vol?.optOut ? 'ביקש לא לקבל הודעות' : sent ? `נשלחה ✓ ${sentAt ?? ''}` : 'טרם נשלחה'}
                          </div>
                        </div>
                        {r.vol && !r.vol.optOut && (
                          <button onClick={() => send(r)}
                            className="px-3 py-1.5 rounded-xl text-xs font-medium text-white"
                            style={{ backgroundColor: sent ? '#9CA3AF' : '#25D366' }}>
                            {sent ? 'שלח שוב' : 'WhatsApp'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
