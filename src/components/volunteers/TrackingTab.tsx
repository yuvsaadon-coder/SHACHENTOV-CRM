import { useState } from 'react'
import type { Branch } from '../../types'
import { useShifts } from '../../hooks/useShifts'
import { useAssignments, useMarkAttendance, useCancelAssignment } from '../../hooks/useAssignments'
import { useVolunteerMembers } from '../../hooks/useVolunteerMembers'
import { useMonthlyResponses, useSetMonthlyResponse } from '../../hooks/useMonthlyResponses'
import {
  currentMonth, nextMonth, prevMonth, monthLabel, formatShiftDate,
  replyState, isMissingReply, REPLY_LABEL, type ReplyState,
} from '../../lib/volunteerUtils'

interface Props { branch: Branch }

const STATUS_LABEL: Record<string, string> = {
  committed: 'רשום', cancelled: 'בוטל', attended: 'הגיע', no_show: 'לא הגיע',
}
const STATE_COLOR: Record<ReplyState, string> = {
  none: '#9CA3AF', sent: '#E97400', opened: '#2563EB', answered: '#16A34A', declined: '#DC2626',
}
const STATUS_COLOR: Record<string, string> = {
  committed: '#189A9F', cancelled: '#9CA3AF', attended: '#16A34A', no_show: '#DC2626',
}

export function TrackingTab({ branch }: Props) {
  const [month, setMonth] = useState(currentMonth())
  const { shifts, loading: shiftsLoading } = useShifts(branch.id, month)
  const { assignments, loading: assignLoading } = useAssignments(branch.id, month)
  const { volunteers } = useVolunteerMembers(branch.id)
  const { responses } = useMonthlyResponses(branch.id, month)
  const markAttendance = useMarkAttendance()
  const cancelAssign = useCancelAssignment()
  const setResponse = useSetMonthlyResponse()
  const [openShiftId, setOpenShiftId] = useState<string | null>(null)
  const [onlyMissing, setOnlyMissing] = useState(false)

  const volById = Object.fromEntries(volunteers.map((v) => [v.id, v]))
  const assignsByShift = assignments.reduce<Record<string, typeof assignments>>((acc, a) => {
    ;(acc[a.shiftId] ??= []).push(a)
    return acc
  }, {})

  const eligible = volunteers.filter((v) => v.status === 'active' && !v.optOut)
  const stateOf = (id: string) => replyState(responses.find((r) => r.volunteerId === id))
  const declined = eligible.filter((v) => stateOf(v.id) === 'declined').length
  const answered = eligible.filter((v) => stateOf(v.id) === 'answered').length
  const sent = eligible.filter((v) => stateOf(v.id) !== 'none').length
  const missing = eligible.filter((v) => isMissingReply(stateOf(v.id))).length
  const replyRows = eligible.filter((v) => !onlyMissing || isMissingReply(stateOf(v.id)))
  const totalCommitted = assignments.filter((a) => a.status === 'committed').length
  const totalAttended = assignments.filter((a) => a.status === 'attended').length

  const loading = shiftsLoading || assignLoading

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-gray-100">
        <button onClick={() => setMonth(prevMonth(month))} className="text-gray-400 hover:text-gray-600 text-lg">›</button>
        <span className="font-semibold text-sm" style={{ color: '#141348' }}>{monthLabel(month)}</span>
        <button onClick={() => setMonth(nextMonth(month))} className="text-gray-400 hover:text-gray-600 text-lg rotate-180">›</button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'נשלחו', value: sent, color: '#E97400' },
          { label: 'ענו', value: answered, color: '#189A9F' },
          { label: 'סירבו', value: declined, color: '#DC2626' },
          { label: 'לא ענו', value: missing, color: '#6B7280' },
          { label: 'רשומים', value: totalCommitted, color: '#141348' },
          { label: 'הגיעו', value: totalAttended, color: '#16A34A' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-2 text-center">
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[10px] text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Replies to the scheduling request */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
          <span className="text-sm font-semibold" style={{ color: '#141348' }}>מענה לבקשת השיבוץ</span>
          <button onClick={() => setOnlyMissing((o) => !o)}
            className={`text-xs px-2.5 py-1 rounded-lg border ${onlyMissing ? 'bg-[#141348] text-white border-[#141348]' : 'border-gray-200 text-gray-500'}`}>
            {onlyMissing ? `חסרי מענה (${missing})` : 'הצג רק חסרי מענה'}
          </button>
        </div>
        {replyRows.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-4">{onlyMissing ? 'כולם ענו 🎉' : 'אין מתנדבים פעילים'}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {replyRows.map((v) => {
              const st = stateOf(v.id)
              return (
                <div key={v.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: '#141348' }}>{v.name}</div>
                    <div className="text-xs font-medium" style={{ color: STATE_COLOR[st] }}>{REPLY_LABEL[st]}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => void setResponse(branch.id, month, v.id, 'answered')} title="סמן שענה (למשל בהודעת WhatsApp)"
                      className={`text-xs px-2 py-1 rounded-lg border ${st === 'answered' ? 'bg-green-100 border-green-300 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-green-50'}`}>
                      ענה
                    </button>
                    <button onClick={() => void setResponse(branch.id, month, v.id, 'declined')} title="סמן שסירב"
                      className={`text-xs px-2 py-1 rounded-lg border ${st === 'declined' ? 'bg-red-100 border-red-300 text-red-700' : 'border-gray-200 text-gray-500 hover:bg-red-50'}`}>
                      סירב
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Per-shift tracking */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">טוען...</div>
      ) : shifts.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">אין חלוקות לחודש זה</div>
      ) : (
        <div className="space-y-2">
          {shifts.map((shift) => {
            const shiftAssigns = assignsByShift[shift.id] ?? []
            const committed = shiftAssigns.filter((a) => a.status === 'committed').length
            const { dayName, label } = formatShiftDate(shift.date)
            const isOpen = openShiftId === shift.id

            return (
              <div key={shift.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setOpenShiftId(isOpen ? null : shift.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-right"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 text-white"
                    style={{ backgroundColor: '#189A9F' }}
                  >
                    <span className="text-[9px]">{dayName}</span>
                    <span className="text-sm font-bold leading-none">{label}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-sm font-medium" style={{ color: '#141348' }}>
                      {shift.startTime}–{shift.endTime}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{shift.location}</div>
                  </div>
                  <div className="text-xs text-gray-500 shrink-0">
                    {committed}/{shift.capacity}
                  </div>
                  <span className="text-gray-400 text-xs ml-1">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                    {shiftAssigns.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center py-2">אין שיבוצים לחלוקה זו</div>
                    ) : (
                      shiftAssigns.map((a) => {
                        const vol = volById[a.volunteerId]
                        return (
                          <div key={a.id} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: '#141348' }}>
                                {vol?.name ?? a.volunteerId}
                              </div>
                              <div className="text-xs" style={{ color: STATUS_COLOR[a.status] }}>
                                {STATUS_LABEL[a.status]}
                              </div>
                            </div>
                            {(a.status === 'committed' || a.status === 'attended' || a.status === 'no_show') && (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => markAttendance(a.id, 'attended')}
                                  className={`text-xs px-2 py-1 rounded-lg border ${a.status === 'attended' ? 'bg-green-100 border-green-300 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-green-50'}`}
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => markAttendance(a.id, 'no_show')}
                                  className={`text-xs px-2 py-1 rounded-lg border ${a.status === 'no_show' ? 'bg-red-100 border-red-300 text-red-700' : 'border-gray-200 text-gray-500 hover:bg-red-50'}`}
                                >
                                  ✗
                                </button>
                                <button
                                  onClick={() => cancelAssign(a.id)}
                                  className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50"
                                >
                                  ביטול
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
