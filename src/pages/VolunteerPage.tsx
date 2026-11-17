import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { formatShiftDate, buildICS } from '../lib/volunteerUtils'

interface ShiftData {
  id: string
  date: string
  startTime: string
  endTime: string
  location: string
  capacity: number
  committed: number
  isMine: boolean
  status: string
}

interface PageData {
  volunteer: { id: string; name: string }
  branch: { id: string; name: string }
  shifts: ShiftData[]
}

type ViewState = 'loading' | 'error' | 'ready' | 'submitting' | 'done' | 'declined'

const API_BASE = import.meta.env.VITE_NETLIFY_FUNCTIONS_URL ?? '/.netlify/functions'

export function VolunteerPage() {
  const { token } = useParams<{ token: string }>()
  const [view, setView] = useState<ViewState>('loading')
  const [data, setData] = useState<PageData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!token) { setView('error'); setErrorMsg('קישור לא תקף'); return }
    fetch(`${API_BASE}/volunteer-page?token=${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setErrorMsg(json.error); setView('error'); return }
        setData(json as PageData)
        // Pre-select already-committed shifts
        const mine = new Set(json.shifts.filter((s: ShiftData) => s.isMine).map((s: ShiftData) => s.id))
        setSelected(mine)
        setView('ready')
      })
      .catch(() => { setErrorMsg('שגיאת חיבור. נסה שוב.'); setView('error') })
  }, [token])

  const toggleShift = (id: string, isMine: boolean) => {
    // Can't un-toggle committed shifts from selection; cancellation is a separate action
    if (isMine) return
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCancel = async (shiftId: string) => {
    if (!confirm('לבטל שיבוץ זה?')) return
    setView('submitting')
    const res = await fetch(`${API_BASE}/volunteer-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'cancel', shiftId }),
    })
    const json = await res.json()
    if (json.error) {
      alert(json.error)
      setView('ready')
    } else {
      // Re-fetch
      const refreshed = await fetch(`${API_BASE}/volunteer-page?token=${token}`).then((r) => r.json())
      if (!refreshed.error) {
        setData(refreshed)
        setSelected(new Set(refreshed.shifts.filter((s: ShiftData) => s.isMine).map((s: ShiftData) => s.id)))
      }
      setView('ready')
    }
  }

  const handleDecline = async () => {
    if (!confirm('לאשר שאינך יכול/ה להשתתף החודש?')) return
    setView('submitting')
    await fetch(`${API_BASE}/volunteer-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'decline' }),
    })
    setView('declined')
  }

  const handleSubmit = async () => {
    if (!data) return
    const newIds = [...selected].filter((id) => !data.shifts.find((s) => s.id === id)?.isMine)
    if (!newIds.length) return alert('לא נבחרו חלוקות חדשות')
    setView('submitting')
    const res = await fetch(`${API_BASE}/volunteer-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'commit', shiftIds: newIds }),
    })
    const json = await res.json()
    if (json.error) {
      alert(json.error)
      setView('ready')
    } else {
      setView('done')
    }
  }

  const handleDownloadICS = () => {
    if (!data) return
    const myShifts = data.shifts
      .filter((s) => s.isMine || selected.has(s.id))
      .map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, location: s.location, branchName: data.branch.name }))
    if (!myShifts.length) return
    const ics = buildICS(data.volunteer.id, myShifts)
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chalukot.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render states ──────────────────────────────────────────────

  if (view === 'loading') return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7FAFA' }}>
      <div className="text-center">
        <div className="text-4xl mb-3">🌱</div>
        <div className="text-sm text-gray-400">טוען...</div>
      </div>
    </div>
  )

  if (view === 'error') return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F7FAFA' }} dir="rtl">
      <div className="bg-white rounded-2xl p-6 shadow text-center max-w-xs">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-sm text-gray-600">{errorMsg}</p>
      </div>
    </div>
  )

  if (view === 'declined') return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F7FAFA' }} dir="rtl">
      <div className="bg-white rounded-2xl p-6 shadow text-center max-w-xs">
        <div className="text-4xl mb-3">🙏</div>
        <h1 className="font-bold mb-2" style={{ color: '#141348' }}>תודה שהודעת</h1>
        <p className="text-sm text-gray-500">רשמנו שאינך יכול/ה החודש. נדבר בחודש הבא!</p>
      </div>
    </div>
  )

  if (view === 'done') return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F7FAFA' }} dir="rtl">
      <div className="bg-white rounded-2xl p-6 shadow text-center max-w-xs">
        <div className="text-4xl mb-3">🎉</div>
        <h1 className="font-bold mb-2" style={{ color: '#141348' }}>תודה! נרשמת בהצלחה</h1>
        <p className="text-sm text-gray-500 mb-4">השיבוצים שלך נשמרו.</p>
        <button
          onClick={handleDownloadICS}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: '#189A9F' }}
        >
          הוסף ללוח שנה (.ics)
        </button>
      </div>
    </div>
  )

  if (!data) return null

  const myShifts = data.shifts.filter((s) => s.isMine)
  const upcoming = data.shifts.filter((s) => s.status !== 'cancelled')

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7FAFA' }} dir="rtl">
      {/* Header */}
      <div
        className="px-4 pt-10 pb-6 text-white"
        style={{ background: 'linear-gradient(135deg, #141348 0%, #189A9F 100%)' }}
      >
        <img src="/logo_shachentov.png" alt="" className="h-10 w-10 rounded-full object-cover mb-3" />
        <div className="text-xs opacity-70">שלום</div>
        <div className="text-xl font-bold">{data.volunteer.name}</div>
        <div className="text-xs opacity-60 mt-0.5">סניף {data.branch.name}</div>
      </div>

      <div className="p-4 space-y-5 max-w-lg mx-auto">
        {/* My commitments */}
        {myShifts.length > 0 && (
          <div>
            <h2 className="font-bold text-sm mb-2" style={{ color: '#141348' }}>החלוקות שלי ({myShifts.length})</h2>
            <div className="space-y-2">
              {myShifts.map((s) => {
                const { dayName, label } = formatShiftDate(s.date)
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-green-200 p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 text-white" style={{ backgroundColor: '#16A34A' }}>
                      <span className="text-[9px]">{dayName}</span>
                      <span className="text-sm font-bold leading-none">{label}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: '#141348' }}>{s.startTime}–{s.endTime}</div>
                      <div className="text-xs text-gray-500 truncate">{s.location}</div>
                    </div>
                    <button onClick={() => handleCancel(s.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">ביטול</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Choose more shifts */}
        {upcoming.length > 0 && (
          <div>
            <h2 className="font-bold text-sm mb-2" style={{ color: '#141348' }}>
              {myShifts.length > 0 ? 'הוסיפו עוד חלוקות' : 'בחר/י חלוקות להצטרפות'}
            </h2>
            <div className="space-y-2">
              {upcoming.filter((s) => !s.isMine).map((s) => {
                const { dayName, label } = formatShiftDate(s.date)
                const isFull = s.committed >= s.capacity
                const isSelected = selected.has(s.id)

                return (
                  <button
                    key={s.id}
                    onClick={() => !isFull && toggleShift(s.id, s.isMine)}
                    disabled={isFull}
                    className={`w-full flex items-center gap-3 rounded-xl border p-3 text-right transition-all ${
                      isFull ? 'opacity-50 cursor-default border-gray-100 bg-white' :
                      isSelected ? 'border-[#189A9F] bg-[#E6F4F4]' : 'border-gray-100 bg-white hover:border-[#189A9F]'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: isFull ? '#9CA3AF' : isSelected ? '#189A9F' : '#D1D5DB', color: isSelected ? 'white' : '#6B7280' }}
                    >
                      <span className="text-[9px]">{dayName}</span>
                      <span className="text-sm font-bold leading-none">{label}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: '#141348' }}>{s.startTime}–{s.endTime}</div>
                      <div className="text-xs text-gray-500 truncate">{s.location}</div>
                    </div>
                    <div className="text-xs shrink-0 text-gray-400">
                      {isFull ? 'מלאה' : `${s.committed}/${s.capacity}`}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {[...selected].some((id) => !data.shifts.find((s) => s.id === id)?.isMine) && (
            <button
              onClick={handleSubmit}
              disabled={view === 'submitting'}
              className="w-full py-3 rounded-xl font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#189A9F' }}
            >
              {view === 'submitting' ? 'שומר...' : 'אשר השתתפות'}
            </button>
          )}
          {myShifts.length > 0 && (
            <button onClick={handleDownloadICS} className="w-full py-2.5 rounded-xl text-sm border border-[#189A9F] text-[#189A9F]">
              הוסף ללוח שנה (.ics)
            </button>
          )}
          <button
            onClick={handleDecline}
            disabled={view === 'submitting'}
            className="w-full py-2.5 rounded-xl text-sm border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            לא יכול/ה החודש
          </button>
        </div>
      </div>
    </div>
  )
}
