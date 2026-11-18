import { useState } from 'react'
import { DocTransferDialog } from './DocTransferDialog'
import { fromDrive, type DocSource } from '../../lib/hqDocTransfer'
import { useHQDriveLinks, useAddHQDriveLink, useUpdateHQDriveLink, useDeleteHQDriveLink } from '../../hooks/useHQDriveLinks'
import { DRIVE_TYPE_LABELS, DRIVE_CAT_LABELS, type HQDriveLink, type DriveItemType, type DriveLinkCategory } from '../../types'
import { useAuth } from '../../context/AuthContext'

const DRIVE_ICONS: Record<DriveItemType, string> = { document: '📄', sheet: '📊', folder: '📁' }
const CAT_TYPES = Object.entries(DRIVE_CAT_LABELS) as [DriveLinkCategory, string][]
const ITEM_TYPES = Object.entries(DRIVE_TYPE_LABELS) as [DriveItemType, string][]

interface FormState {
  name: string
  url: string
  driveType: DriveItemType
  category: DriveLinkCategory
  year: string
  notes: string
}

function emptyForm(): FormState {
  return { name: '', url: '', driveType: 'document', category: 'other', year: '', notes: '' }
}

function LinkForm({ initial, onSave, onClose }: { initial?: HQDriveLink; onSave: (form: FormState) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(
    initial
      ? { name: initial.name, url: initial.url, driveType: initial.driveType, category: initial.category, year: initial.year?.toString() ?? '', notes: initial.notes ?? '' }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) { setErr('שם וקישור הם שדות חובה'); return }
    setSaving(true)
    try { await onSave(form); onClose() }
    catch { setErr('שגיאה בשמירה') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        dir="rtl"
      >
        <h2 className="text-lg font-bold" style={{ color: '#141348' }}>{initial ? 'עריכת קישור Drive' : 'הוספת קישור Drive'}</h2>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">שם *</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="תקציב שנתי 2025" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">קישור *</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" type="url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://docs.google.com/..." dir="ltr" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">סוג</label>
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.driveType} onChange={(e) => setForm((f) => ({ ...f, driveType: e.target.value as DriveItemType }))}>
              {ITEM_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">קטגוריה</label>
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as DriveLinkCategory }))}>
              {CAT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">שנה</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} placeholder="2025" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">הערות</label>
          <textarea className="border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
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

export function DriveLinksTab() {
  const { links, loading } = useHQDriveLinks()
  const addLink = useAddHQDriveLink()
  const updateLink = useUpdateHQDriveLink()
  const deleteLink = useDeleteHQDriveLink()
  const { access } = useAuth()
  const isAdmin = access === 'admin' || access === 'hq'
  const { isManager } = useAuth()
  const [transferSrc, setTransferSrc] = useState<DocSource | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HQDriveLink | null>(null)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleSave = async (form: FormState) => {
    const year = form.year ? parseInt(form.year) : undefined
    const data = { name: form.name, url: form.url, driveType: form.driveType, category: form.category, year, notes: form.notes || undefined, active: true }
    if (editing) await updateLink(editing.id, data)
    else await addLink(data)
  }

  const filtered = links.filter((l) => {
    if (catFilter !== 'all' && l.category !== catFilter) return false
    if (search && !l.name.includes(search)) return false
    return true
  })

  const grouped = filtered.reduce<Record<string, HQDriveLink[]>>((acc, l) => {
    const key = DRIVE_CAT_LABELS[l.category]
    ;(acc[key] ??= []).push(l)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[150px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="חיפוש..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">כל הקטגוריות</option>
          {CAT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
        <div className="text-sm text-gray-400 py-8 text-center">אין קישורים</div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{cat}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((l) => (
                <div key={l.id} className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-4 flex items-start gap-3">
                    <span className="text-2xl shrink-0 mt-0.5">{DRIVE_ICONS[l.driveType]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm leading-snug" style={{ color: '#141348' }}>{l.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{DRIVE_TYPE_LABELS[l.driveType]}{l.year ? ` · ${l.year}` : ''}</div>
                    </div>
                  </div>
                  {l.notes && (
                    <p className="px-4 pb-3 text-xs text-gray-500 line-clamp-2 -mt-1">{l.notes}</p>
                  )}
                  <div className="mt-auto border-t border-gray-50 px-3 py-2 flex items-center gap-1.5">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: '#141348' }}
                    >
                      פתח
                    </a>
                    {isAdmin && (
                      <div className="mr-auto flex gap-1.5">
                        <button onClick={() => { setEditing(l); setShowForm(true) }} className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100">✏️</button>
                        {isManager && <button onClick={() => setTransferSrc(fromDrive(l))} className="text-xs px-2 py-1.5 rounded-lg border border-orange-100 text-orange-600 hover:bg-orange-50" title="העבר ללשונית אחרת">⇄ העבר</button>}
                        {isManager && <button onClick={() => setConfirmDelete(l.id)} className="text-xs px-2 py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50">🗑</button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full flex flex-col gap-4" dir="rtl">
            <h2 className="text-lg font-bold text-red-700">מחיקת קישור</h2>
            <p className="text-sm text-gray-600">האם למחוק קישור זה לצמיתות?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">ביטול</button>
              <button
                onClick={async () => { await deleteLink(confirmDelete); setConfirmDelete(null) }}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                מחק
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <LinkForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
      {transferSrc && <DocTransferDialog source={transferSrc} onClose={() => setTransferSrc(null)} />}
    </div>
  )
}
