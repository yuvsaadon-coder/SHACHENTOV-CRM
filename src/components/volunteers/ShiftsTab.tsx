import { useState } from 'react'
import type { Branch, Shift } from '../../types'
import {
  useShifts, useAddShift, useUpdateShift, useDeleteShift, useDuplicateMonth,
} from '../../hooks/useShifts'
import { formatShiftDate, currentMonth, nextMonth, prevMonth, monthLabel } from '../../lib/volunteerUtils'

interface Props { branch: Branch }

const EMPTY_FORM = { date: '', startTime: '08:30', endTime: '11:00', location: '', capacity: 20, notes: '' }

function ShiftForm({
  initial, onSave, onCancel,
}: {
  initial: typeof EMPTY_FORM
  onSave: (d: typeof EMPTY_FORM) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">תאריך</label>
          <input type="date" value={form.date} onChange={set('date')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">שעת התחלה</label>
          <input type="time" value={form.startTime} onChange={set('startTime')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">שעת סיום</label>
          <input type="time" value={form.endTime} onChange={set('endTime')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">מיקום</label>
          <input value={form.location} onChange={set('location')} placeholder="כתובת / שם מקום" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">קיבולת</label>
          <input type="number" min={1} value={form.capacity} onChange={set('capacity')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">הערות (אופציונלי)</label>
          <input value={form.notes} onChange={set('notes')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => form.date && form.location ? onSave(form) : alert('נא למלא תאריך ומיקום')}
          className="flex-1 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: '#189A9F' }}
        >
          שמור
        </button>
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm border border-gray-200 text-gray-600">ביטול</button>
      </div>
    </div>
  )
}

function ShiftCard({
  shift, onEdit, onDelete,
}: {
  shift: Shift
  onEdit: () => void
  onDelete: () => void
}) {
  const { dayName, label } = formatShiftDate(shift.date)
  const colorMap = { open: '#189A9F', full: '#E97400', cancelled: '#DC2626' }
  const labelMap = { open: 'פתוחה', full: 'מלאה', cancelled: 'בוטלה' }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
      <div
        className="w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 text-white"
        style={{ backgroundColor: colorMap[shift.status] }}
      >
        <span className="text-[10px] leading-none">{dayName}</span>
        <span className="text-sm font-bold leading-none mt-0.5">{label}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: '#141348' }}>
          {shift.startTime}–{shift.endTime}
        </div>
        <div className="text-xs text-gray-500 truncate">{shift.location}</div>
        <div className="text-xs text-gray-400">{labelMap[shift.status]} · קיבולת {shift.capacity}</div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xs">✏️</button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 text-xs">🗑️</button>
      </div>
    </div>
  )
}

export function ShiftsTab({ branch }: Props) {
  const [month, setMonth] = useState(currentMonth())
  const { shifts, loading } = useShifts(branch.id, month)
  const addShift = useAddShift(branch.id)
  const updateShift = useUpdateShift()
  const deleteShift = useDeleteShift()
  const duplicateMonth = useDuplicateMonth(branch.id)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  const handleAdd = async (form: typeof EMPTY_FORM) => {
    await addShift({
      branchId: branch.id,
      month,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      location: form.location,
      capacity: Number(form.capacity),
      notes: form.notes || undefined,
      status: 'open',
    })
    setShowForm(false)
  }

  const handleEdit = async (shift: Shift, form: typeof EMPTY_FORM) => {
    await updateShift(shift.id, {
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      location: form.location,
      capacity: Number(form.capacity),
      notes: form.notes || undefined,
    })
    setEditId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק חלוקה זו?')) return
    await deleteShift(id)
  }

  const handleDuplicate = async () => {
    if (!shifts.length) return alert('אין חלוקות לשכפל')
    const target = nextMonth(month)
    if (!confirm(`לשכפל ${shifts.length} חלוקות לחודש ${monthLabel(target)}?`)) return
    setDuplicating(true)
    try {
      await duplicateMonth(shifts, target)
      setMonth(target)
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-gray-100">
        <button onClick={() => setMonth(prevMonth(month))} className="text-gray-400 hover:text-gray-600 text-lg">›</button>
        <span className="font-semibold text-sm" style={{ color: '#141348' }}>{monthLabel(month)}</span>
        <button onClick={() => setMonth(nextMonth(month))} className="text-gray-400 hover:text-gray-600 text-lg rotate-180">›</button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowForm(true); setEditId(null) }}
          className="flex-1 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: '#189A9F' }}
        >
          + חלוקה חדשה
        </button>
        <button
          onClick={handleDuplicate}
          disabled={duplicating}
          className="px-3 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {duplicating ? '...' : 'שכפל'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <ShiftForm
          initial={{ ...EMPTY_FORM, date: `${month}-01` }}
          onSave={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Shift list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">טוען...</div>
      ) : shifts.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">אין חלוקות לחודש זה</div>
      ) : (
        <div className="space-y-2">
          {shifts.map((s) => editId === s.id ? (
            <ShiftForm
              key={s.id}
              initial={{
                date: s.date, startTime: s.startTime, endTime: s.endTime,
                location: s.location, capacity: s.capacity, notes: s.notes ?? '',
              }}
              onSave={(form) => handleEdit(s, form)}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <ShiftCard
              key={s.id}
              shift={s}
              onEdit={() => setEditId(s.id)}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
