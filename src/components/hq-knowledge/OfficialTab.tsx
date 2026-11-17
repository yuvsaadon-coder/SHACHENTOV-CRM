import { useState, useRef } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useHQOfficialDocs, useAddHQOfficialDoc, useUpdateHQOfficialDoc } from '../../hooks/useHQOfficialDocs'
import { OFFICIAL_DOC_LABELS, type HQOfficialDoc, type OfficialDocSubtype } from '../../types'
import { useAuth } from '../../context/AuthContext'
import { uploadFile, storagePath } from '../../lib/uploadFile'

const SUBTYPES = Object.entries(OFFICIAL_DOC_LABELS) as [OfficialDocSubtype, string][]


const ALERT_DAYS = 90

function daysUntil(ts: Timestamp | undefined): number | null {
  if (!ts) return null
  const diff = ts.toDate().getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function ExpiryBadge({ validUntil }: { validUntil?: Timestamp }) {
  const days = daysUntil(validUntil)
  if (days === null) return null
  if (days < 0) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">פג תוקף</span>
  if (days <= ALERT_DAYS) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">פג בעוד {days} ימים</span>
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">תקף עד {validUntil!.toDate().toLocaleDateString('he-IL')}</span>
}

function DocCard({ doc: d, isAdmin, onEdit }: { doc: HQOfficialDoc; isAdmin: boolean; onEdit: (d: HQOfficialDoc) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-right px-4 py-4 hover:bg-gray-50 transition-colors flex items-center gap-3"
      >
        <span className="text-2xl shrink-0">📋</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm mb-1" style={{ color: '#141348' }}>
            {OFFICIAL_DOC_LABELS[d.subtype]}
          </div>
          <div className="flex flex-wrap gap-2">
            <ExpiryBadge validUntil={d.validUntil} />
            {d.year && <span className="text-xs text-gray-400">שנת {d.year}</span>}
            {d.registrationNumber && <span className="text-xs text-gray-400">מס׳ {d.registrationNumber}</span>}
          </div>
        </div>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-2">
          {d.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{d.notes}</p>}
          <div className="flex gap-2 flex-wrap">
            {d.fileUrl && (
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#141348' }}
              >
                📎 {d.fileName ?? 'פתח קובץ'}
              </a>
            )}
            {isAdmin && (
              <button
                onClick={() => onEdit(d)}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                ✏️ עריכה
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface FormState {
  subtype: OfficialDocSubtype
  year: string
  validUntil: string
  registrationNumber: string
  notes: string
}

function DocForm({ initial, onSave, onClose, uid }: { initial?: HQOfficialDoc; onSave: (form: FormState, fileData?: { fileUrl: string; fileName: string }) => Promise<void>; onClose: () => void; uid: string }) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          subtype: initial.subtype,
          year: initial.year?.toString() ?? '',
          validUntil: initial.validUntil ? initial.validUntil.toDate().toISOString().slice(0, 10) : '',
          registrationNumber: initial.registrationNumber ?? '',
          notes: initial.notes ?? '',
        }
      : { subtype: 'approval', year: '', validUntil: '', registrationNumber: '', notes: '' }
  )
  const [file, setFile] = useState<File | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(''); setFile(f)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (file) {
        const path = storagePath('hq_official_docs', uid, file.name)
        await new Promise<void>((resolve, reject) => {
          uploadFile(path, file, (p) => {
            if (!p.done) { setUploadPct(p.progress); return }
            setUploadPct(null)
            onSave(form, { fileUrl: p.url, fileName: p.fileName }).then(resolve).catch(reject)
          }, reject)
        })
      } else if (linkUrl.trim()) {
        if (!/^https?:\/\//i.test(linkUrl.trim())) { setErr('הקישור חייב להתחיל ב-https://'); setSaving(false); return }
        await onSave(form, { fileUrl: linkUrl.trim(), fileName: 'קישור' })
      } else {
        await onSave(form)
      }
      onClose()
    } catch { setErr('שגיאה בשמירה'); setSaving(false); setUploadPct(null) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        dir="rtl"
      >
        <h2 className="text-lg font-bold" style={{ color: '#141348' }}>{initial ? 'עריכת מסמך רשמי' : 'הוספת מסמך רשמי'}</h2>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">סוג מסמך</label>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.subtype} onChange={(e) => setForm((f) => ({ ...f, subtype: e.target.value as OfficialDocSubtype }))}>
            {SUBTYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">שנה</label>
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} placeholder="2025" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">תוקף עד</label>
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" type="date" value={form.validUntil} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">מספר רישום</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.registrationNumber} onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))} placeholder="58-123456" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">קובץ</label>
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:border-indigo-300" onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFile} />
            {file ? <span className="text-sm text-green-700 font-medium">✓ {file.name}</span> : <span className="text-sm text-gray-400">לחץ לבחירת קובץ</span>}
          </div>
          <input
            type="url"
            dir="ltr"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="או הדבק קישור (Drive / אתר) https://..."
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 mt-1"
          />
          {uploadPct !== null && (
            <div className="mt-1">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
              <div className="text-xs text-gray-400 mt-0.5 text-center">{uploadPct}%</div>
            </div>
          )}
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

export function OfficialTab() {
  const { docs, loading } = useHQOfficialDocs()
  const addDoc = useAddHQOfficialDoc()
  const updateDoc = useUpdateHQOfficialDoc()
  const { access, firebaseUser } = useAuth()
  const isAdmin = access === 'admin' || access === 'hq'

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HQOfficialDoc | null>(null)

  const handleSave = async (form: FormState, fileData?: { fileUrl: string; fileName: string }) => {
    const validUntil = form.validUntil ? Timestamp.fromDate(new Date(form.validUntil)) : undefined
    const year = form.year ? parseInt(form.year) : undefined
    const data = { subtype: form.subtype, year, validUntil, registrationNumber: form.registrationNumber || undefined, notes: form.notes || undefined, ...fileData, active: true }
    if (editing) await updateDoc(editing.id, data)
    else await addDoc(data)
  }

  const expiring = docs.filter((d) => { const days = daysUntil(d.validUntil); return days !== null && days <= ALERT_DAYS })

  return (
    <div className="flex flex-col gap-4">
      {expiring.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2">
          <span className="text-orange-500 mt-0.5">⚠️</span>
          <div>
            <div className="text-sm font-semibold text-orange-800 mb-1">מסמכים שפג תוקפם / עומדים לפוג</div>
            <ul className="text-sm text-orange-700 list-disc pr-4">
              {expiring.map((d) => {
                const days = daysUntil(d.validUntil)
                return <li key={d.id}>{OFFICIAL_DOC_LABELS[d.subtype]} — {days && days < 0 ? 'פג תוקף' : `פג בעוד ${days} ימים`}</li>
              })}
            </ul>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="px-4 py-2 text-sm rounded-lg text-white font-medium hover:opacity-90"
            style={{ backgroundColor: '#141348' }}
          >
            + הוספה
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">טוען...</div>
      ) : docs.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">אין מסמכים רשמיים</div>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map((d) => (
            <DocCard key={d.id} doc={d} isAdmin={isAdmin} onEdit={(d) => { setEditing(d); setShowForm(true) }} />
          ))}
        </div>
      )}

      {showForm && (
        <DocForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
          uid={firebaseUser?.uid ?? ''}
        />
      )}
    </div>
  )
}
