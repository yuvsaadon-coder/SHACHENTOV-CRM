import { useState } from 'react'
import { useHQSuppliers, useAddHQSupplier, useUpdateHQSupplier } from '../../hooks/useHQSuppliers'
import type { HQSupplier, Contact } from '../../types'
import { useAuth } from '../../context/AuthContext'
import { useContacts } from '../../hooks/useContacts'

interface FormState {
  name: string
  categories: string
  status: 'active' | 'inactive'
  contactName: string
  phone: string
  email: string
  contactIds: string[]
  notes: string
}

function emptyForm(): FormState {
  return { name: '', categories: '', status: 'active', contactName: '', phone: '', email: '', contactIds: [], notes: '' }
}

function SupplierForm({ initial, onSave, onClose, allContacts }: { initial?: HQSupplier; onSave: (form: FormState) => Promise<void>; onClose: () => void; allContacts: Contact[] }) {
  const [form, setForm] = useState<FormState>(
    initial
      ? { name: initial.name, categories: initial.categories.join(', '), status: initial.status, contactName: initial.contactName ?? '', phone: initial.phone ?? '', email: initial.email ?? '', contactIds: initial.contactIds ?? [], notes: initial.notes ?? '' }
      : emptyForm()
  )
  const [contactSearch, setContactSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setErr('שם חובה'); return }
    setSaving(true)
    try { await onSave(form); onClose() }
    catch { setErr('שגיאה בשמירה') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        dir="rtl"
      >
        <h2 className="text-lg font-bold" style={{ color: '#141348' }}>{initial ? 'עריכת ספק' : 'הוספת ספק'}</h2>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">שם *</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="שם הספק" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">קטגוריות (מופרד בפסיק)</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.categories} onChange={(e) => setForm((f) => ({ ...f, categories: e.target.value }))} placeholder="מזון, ביצים, חלב" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">סטטוס</label>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}>
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">איש קשר</label>
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">טלפון</label>
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} dir="ltr" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">אימייל</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} dir="ltr" />
        </div>

        {/* Linked contacts */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">אנשי קשר מקושרים</label>
          {form.contactIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1">
              {form.contactIds.map((cid) => {
                const c = allContacts.find((x) => x.id === cid)
                if (!c) return null
                return (
                  <span key={cid} className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100">
                    👤 {c.name}{c.organization ? ` (${c.organization})` : ''}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, contactIds: f.contactIds.filter((x) => x !== cid) }))} className="text-indigo-400 hover:text-red-500 font-bold leading-none">×</button>
                  </span>
                )
              })}
            </div>
          )}
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="חיפוש איש קשר..."
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
          />
          {contactSearch.trim() && (
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
              {allContacts
                .filter((c) => !form.contactIds.includes(c.id) && (c.name.includes(contactSearch) || (c.organization ?? '').includes(contactSearch) || (c.email ?? '').includes(contactSearch)))
                .slice(0, 8)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, contactIds: [...f.contactIds, c.id] })); setContactSearch('') }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
                  >
                    <span className="font-medium" style={{ color: '#141348' }}>{c.name}</span>
                    {c.organization && <span className="text-gray-400 text-xs">— {c.organization}</span>}
                    {c.email && <span className="text-gray-400 text-xs mr-auto">{c.email}</span>}
                  </button>
                ))}
              {allContacts.filter((c) => !form.contactIds.includes(c.id) && (c.name.includes(contactSearch) || (c.organization ?? '').includes(contactSearch))).length === 0 && (
                <p className="text-sm text-gray-400 px-3 py-2">לא נמצאו תוצאות</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">הערות</label>
          <textarea className="border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>

        {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">ביטול</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg text-white font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SupplierCard({ supplier: s, isAdmin, onEdit, linkedContacts }: { supplier: HQSupplier; isAdmin: boolean; onEdit: (s: HQSupplier) => void; linkedContacts: Contact[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-right px-4 py-3.5 hover:bg-gray-50 transition-colors flex items-center gap-3"
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-white text-sm bg-indigo-700">
          {s.name.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: '#141348' }}>{s.name}</div>
          {s.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {s.categories.slice(0, 3).map((c) => (
                <span key={c} className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">{c}</span>
              ))}
            </div>
          )}
        </div>
        {linkedContacts.length > 0 && (
          <span className="text-xs text-indigo-500 shrink-0">👤 {linkedContacts.length}</span>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {s.status === 'active' ? 'פעיל' : 'לא פעיל'}
        </span>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-2">
          {/* Legacy inline contact fields */}
          {(s.contactName || s.phone || s.email) && (
            <div className="text-sm text-gray-600 flex flex-wrap gap-3">
              {s.contactName && <span>👤 {s.contactName}</span>}
              {s.phone && <span>📞 {s.phone}</span>}
              {s.email && <span>✉️ {s.email}</span>}
            </div>
          )}
          {/* Linked contacts from contacts collection */}
          {linkedContacts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">אנשי קשר</span>
              {linkedContacts.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm bg-indigo-50 rounded-lg px-3 py-2">
                  <span className="font-medium" style={{ color: '#141348' }}>{c.name}</span>
                  {c.email && <a href={`mailto:${c.email}`} className="text-indigo-600 hover:underline text-xs">{c.email}</a>}
                  {c.phone && <span className="text-gray-500 text-xs">{c.phone}</span>}
                </div>
              ))}
            </div>
          )}
          {s.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{s.notes}</p>}
          {isAdmin && (
            <button onClick={() => onEdit(s)} className="self-start text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">✏️ עריכה</button>
          )}
        </div>
      )}
    </div>
  )
}

export function SuppliersTab() {
  const { suppliers, loading } = useHQSuppliers()
  const addSupplier = useAddHQSupplier()
  const updateSupplier = useUpdateHQSupplier()
  const { contacts } = useContacts()
  const { access } = useAuth()
  const isAdmin = access === 'admin' || access === 'hq'

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HQSupplier | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const handleSave = async (form: FormState) => {
    const categories = form.categories.split(',').map((c) => c.trim()).filter(Boolean)
    const data = {
      name: form.name,
      categories,
      status: form.status,
      contactName: form.contactName || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      contactIds: form.contactIds.length > 0 ? form.contactIds : undefined,
      notes: form.notes || undefined,
      active: true,
      branchIds: [],
    }
    if (editing) await updateSupplier(editing.id, data)
    else await addSupplier(data)
  }

  const filtered = suppliers.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (search && !s.name.includes(search) && !s.categories.some((c) => c.includes(search))) return false
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[150px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="חיפוש..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="inactive">לא פעיל</option>
        </select>
        {isAdmin && (
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="px-4 py-2 text-sm rounded-lg text-white font-medium hover:opacity-90"
            style={{ backgroundColor: '#141348' }}
          >
            + הוספה
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">אין ספקים</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((s) => {
            const linked = (s.contactIds ?? []).map((id) => contacts.find((c) => c.id === id)).filter(Boolean) as import('../../types').Contact[]
            return <SupplierCard key={s.id} supplier={s} isAdmin={isAdmin} onEdit={(s) => { setEditing(s); setShowForm(true) }} linkedContacts={linked} />
          })}
        </div>
      )}

      {showForm && (
        <SupplierForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
          allContacts={contacts}
        />
      )}
    </div>
  )
}
