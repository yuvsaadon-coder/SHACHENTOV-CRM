import { useState } from 'react'
import type { Branch } from '../../types'
import { useVolunteerMembers } from '../../hooks/useVolunteerMembers'
import { useShifts } from '../../hooks/useShifts'
import { waLink, buildICS, currentMonth, nextMonth, prevMonth, monthLabel } from '../../lib/volunteerUtils'

interface Props { branch: Branch }

export function SendTab({ branch }: Props) {
  const [month, setMonth] = useState(nextMonth(currentMonth()))
  const { volunteers, loading } = useVolunteerMembers(branch.id)
  const { shifts } = useShifts(branch.id, month)
  const [search, setSearch] = useState('')

  const filtered = volunteers.filter(
    (v) => v.status === 'active' && !v.optOut &&
      (v.name.includes(search) || v.phone.includes(search))
  )

  const handleDownloadICS = (volunteerId: string, name: string) => {
    const myShifts = shifts.map((s) => ({
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location,
      branchName: branch.name,
    }))
    if (!myShifts.length) return alert('אין חלוקות לחודש זה')
    const ics = buildICS(volunteerId, myShifts)
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chalukot_${name}_${month}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-gray-100">
        <button onClick={() => setMonth(prevMonth(month))} className="text-gray-400 hover:text-gray-600 text-lg">›</button>
        <span className="font-semibold text-sm" style={{ color: '#141348' }}>{monthLabel(month)}</span>
        <button onClick={() => setMonth(nextMonth(month))} className="text-gray-400 hover:text-gray-600 text-lg rotate-180">›</button>
      </div>

      {/* Info banner */}
      <div className="bg-[#E6F4F4] rounded-xl px-4 py-3 text-xs text-[#189A9F]">
        לחץ על לחצן WhatsApp לשליחת הודעה אישית עם הקישור האישי של המתנדב.
        {shifts.length > 0 ? ` יש ${shifts.length} חלוקות לחודש זה.` : ' עוד לא הוגדרו חלוקות לחודש זה.'}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש לפי שם / טלפון"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
      />

      {/* Volunteer list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {search ? 'לא נמצאו תוצאות' : 'אין מתנדבים פעילים'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const token = v.tokens?.[branch.id]
            const wa = token ? waLink(v.phone, v.name, branch.name, month, token) : null

            return (
              <div key={v.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
                  style={{ backgroundColor: '#189A9F' }}
                >
                  {v.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: '#141348' }}>{v.name}</div>
                  <div className="text-xs text-gray-500">{v.phone}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-white"
                      style={{ backgroundColor: '#25D366' }}
                    >
                      <span>WhatsApp</span>
                    </a>
                  )}
                  {shifts.length > 0 && (
                    <button
                      onClick={() => handleDownloadICS(v.id, v.name)}
                      className="px-2 py-1.5 rounded-xl text-xs border border-gray-200 text-gray-500 hover:bg-gray-50"
                      title="הורד לוח שנה"
                    >
                      📅
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
