import { useState, useRef } from 'react'
import type { Branch, VolunteerMember } from '../../types'
import {
  useVolunteerMembers, useAddVolunteerMember, useUpdateVolunteerMember,
  useRegenerateToken, useImportVolunteers,
} from '../../hooks/useVolunteerMembers'

interface Props { branch: Branch }

function VolunteerRow({
  v, branchId, onEdit, onRegen,
}: {
  v: VolunteerMember
  branchId: string
  onEdit: (v: VolunteerMember) => void
  onRegen: () => void
}) {
  const token = v.tokens?.[branchId] ?? ''
  const link = token ? `${window.location.origin}/v/${token}` : ''

  const copyLink = () => {
    if (!link) return
    navigator.clipboard.writeText(link).catch(() => {})
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
        style={{ backgroundColor: '#189A9F' }}
      >
        {v.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: '#141348' }}>{v.name}</div>
        <div className="text-xs text-gray-500">{v.phone}</div>
        {v.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {v.tags.map((t) => (
              <span key={t} className="text-[10px] bg-[#E6F4F4] text-[#189A9F] rounded px-1.5 py-0.5">{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={copyLink} title="העתק קישור" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-sm">🔗</button>
        <button onClick={() => onEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-sm">✏️</button>
        <button onClick={onRegen} title="חדש קישור" className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-400 text-sm">🔄</button>
      </div>
    </div>
  )
}

function AddForm({ onSave, onCancel }: { onSave: (d: { name: string; phone: string; tags: string[] }) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', tags: '' })
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="space-y-2">
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="שם מתנדב"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
        />
        <input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="טלפון (050...)"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          type="tel"
        />
        <input
          value={form.tags}
          onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          placeholder="תגיות — מופרדות בפסיק (אופציונלי)"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => form.name && form.phone ? onSave({ name: form.name, phone: form.phone, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) }) : alert('נא למלא שם וטלפון')}
          className="flex-1 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: '#189A9F' }}
        >
          הוסף
        </button>
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm border border-gray-200 text-gray-600">ביטול</button>
      </div>
    </div>
  )
}

function EditForm({ v, onSave, onCancel }: { v: VolunteerMember; onSave: (d: Partial<VolunteerMember>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: v.name, phone: v.phone, tags: v.tags.join(', ') })
  return (
    <div className="bg-white rounded-2xl border border-[#189A9F] p-4 space-y-3">
      <div className="text-xs font-semibold text-[#189A9F] mb-1">עריכה: {v.name}</div>
      <div className="space-y-2">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" type="tel" />
        <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="תגיות" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ name: form.name, phone: form.phone, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) })} className="flex-1 py-2 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: '#189A9F' }}>שמור</button>
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm border border-gray-200 text-gray-600">ביטול</button>
      </div>
    </div>
  )
}

export function VolunteersTab({ branch }: Props) {
  const { volunteers, loading } = useVolunteerMembers(branch.id)
  const addVolunteer = useAddVolunteerMember(branch.id)
  const updateVolunteer = useUpdateVolunteerMember()
  const regenToken = useRegenerateToken()
  const importVolunteers = useImportVolunteers(branch.id)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = volunteers.filter((v) =>
    v.name.includes(search) || v.phone.includes(search)
  )

  const handleAdd = async (data: { name: string; phone: string; tags: string[] }) => {
    await addVolunteer(data)
    setShowAdd(false)
  }

  const handleEdit = async (v: VolunteerMember, data: Partial<VolunteerMember>) => {
    await updateVolunteer(v.id, data)
    setEditId(null)
  }

  const handleRegen = async (v: VolunteerMember) => {
    const oldToken = v.tokens?.[branch.id]
    if (!oldToken) return
    if (!confirm(`לחדש את הקישור של ${v.name}? הקישור הישן יפסיק לעבוד.`)) return
    await regenToken(v.id, branch.id, oldToken)
  }

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const lines = text.split('\n').slice(1) // skip header
      const rows = lines
        .map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
        .filter((r) => r[0] && r[1])
        .map((r) => ({ name: r[0], phone: r[1], tags: r[2] ? r[2].split(';').map((t) => t.trim()) : [] }))
      if (!rows.length) return alert('לא נמצאו שורות תקפות')
      if (!confirm(`לייבא ${rows.length} מתנדבים?`)) return
      await importVolunteers(rows)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Stats */}
      <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">סה"כ מתנדבים</span>
        <span className="font-bold text-lg" style={{ color: '#189A9F' }}>{volunteers.length}</span>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש לפי שם / טלפון"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
      />

      {/* Toolbar */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowAdd(true); setEditId(null) }}
          className="flex-1 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: '#189A9F' }}
        >
          + מתנדב חדש
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="px-3 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {importing ? '...' : 'ייבוא CSV'}
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
      </div>

      {showAdd && <AddForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />}

      {/* List */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {search ? 'לא נמצאו תוצאות' : 'אין מתנדבים רשומים'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => editId === v.id ? (
            <EditForm key={v.id} v={v} onSave={(d) => handleEdit(v, d)} onCancel={() => setEditId(null)} />
          ) : (
            <VolunteerRow
              key={v.id}
              v={v}
              branchId={branch.id}
              onEdit={() => setEditId(v.id)}
              onRegen={() => handleRegen(v)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
