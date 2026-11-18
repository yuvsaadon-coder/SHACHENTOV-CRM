import { useState } from 'react'
import type { Branch } from '../../types'
import { useVolunteerMembers } from '../../hooks/useVolunteerMembers'
import { useShifts } from '../../hooks/useShifts'
import { useMonthlyResponses, useMarkRequestSent } from '../../hooks/useMonthlyResponses'
import {
  waLink, buildICS, currentMonth, nextMonth, prevMonth, monthLabel,
  DEFAULT_SEND_TEMPLATE, replyState, isMissingReply, REPLY_LABEL, type ReplyState,
} from '../../lib/volunteerUtils'
import { useTemplate } from './useTemplate'
import { TemplateEditor } from './TemplateEditor'

interface Props { branch: Branch }

type Filter = 'all' | 'unsent' | 'noreply'

const STATE_COLOR: Record<ReplyState, string> = {
  none: '#9CA3AF', sent: '#E97400', opened: '#2563EB', answered: '#16A34A', declined: '#DC2626',
}

export function SendTab({ branch }: Props) {
  const [month, setMonth] = useState(nextMonth(currentMonth()))
  const { volunteers, loading } = useVolunteerMembers(branch.id)
  const { shifts } = useShifts(branch.id, month)
  const { responses } = useMonthlyResponses(branch.id, month)
  const markSent = useMarkRequestSent()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [template, setTemplate, resetTemplate] = useTemplate(`vol_send_tpl_${branch.id}`, DEFAULT_SEND_TEMPLATE)

  const stateOf = (id: string) => replyState(responses.find((r) => r.volunteerId === id))

  const eligible = volunteers.filter((v) => v.status === 'active' && !v.optOut)
  const withToken = eligible.filter((v) => v.tokens?.[branch.id])
  const sentCount = withToken.filter((v) => stateOf(v.id) !== 'none').length
  const unsent = withToken.filter((v) => stateOf(v.id) === 'none')

  const filtered = eligible.filter((v) => {
    if (!(v.name.includes(search) || v.phone.includes(search))) return false
    const st = stateOf(v.id)
    if (filter === 'unsent') return st === 'none'
    if (filter === 'noreply') return st !== 'none' && isMissingReply(st)
    return true
  })

  const nextUp = filtered.find((v) => v.tokens?.[branch.id] && stateOf(v.id) === 'none')

  const open = (v: (typeof volunteers)[number]) => {
    const token = v.tokens?.[branch.id]
    if (!token) return
    window.open(waLink(v.phone, v.name, branch.name, month, token, template), '_blank', 'noopener,noreferrer')
    void markSent(branch.id, month, v.id)
  }

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

      {/* Progress + queue */}
      <div className="bg-[#E6F4F4] rounded-xl px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-[#189A9F]">
          <span>
            נשלחו {sentCount} מתוך {withToken.length} · נותרו {unsent.length}
          </span>
          <span>{shifts.length > 0 ? `${shifts.length} חלוקות` : 'עוד לא הוגדרו חלוקות'}</span>
        </div>
        <div className="h-1.5 bg-white rounded-full overflow-hidden">
          <div className="h-full bg-[#189A9F] transition-all" style={{ width: `${withToken.length ? (sentCount / withToken.length) * 100 : 0}%` }} />
        </div>
        <button
          onClick={() => nextUp && open(nextUp)}
          disabled={!nextUp}
          className="w-full py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: '#25D366' }}
        >
          {nextUp ? `שלח לבא בתור: ${nextUp.name}` : 'כולם קיבלו הודעה ✓'}
        </button>
      </div>

      <TemplateEditor
        value={template}
        onChange={setTemplate}
        onReset={resetTemplate}
        placeholders={['name', 'branch', 'month', 'link']}
      />

      {/* Filters */}
      <div className="flex gap-1.5">
        {([['all', 'כולם'], ['unsent', 'טרם נשלח'], ['noreply', 'נשלח, לא ענה']] as [Filter, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${filter === k ? 'bg-[#141348] text-white border-[#141348]' : 'bg-white text-gray-500 border-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

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
          {search || filter !== 'all' ? 'לא נמצאו תוצאות' : 'אין מתנדבים פעילים'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const token = v.tokens?.[branch.id]
            const st = stateOf(v.id)
            const isNext = nextUp?.id === v.id

            return (
              <div key={v.id} className={`bg-white rounded-xl border p-3 flex items-center gap-3 ${isNext ? 'border-[#25D366]' : 'border-gray-100'}`}>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
                  style={{ backgroundColor: '#189A9F' }}
                >
                  {v.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: '#141348' }}>{v.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span dir="ltr">{v.phone}</span>
                    <span className="font-medium" style={{ color: STATE_COLOR[st] }}>{REPLY_LABEL[st]}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {token ? (
                    <button
                      onClick={() => open(v)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-white"
                      style={{ backgroundColor: st === 'none' ? '#25D366' : '#9CA3AF' }}
                    >
                      {st === 'none' ? 'WhatsApp' : 'שלח שוב'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-gray-400 self-center">אין קישור</span>
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
