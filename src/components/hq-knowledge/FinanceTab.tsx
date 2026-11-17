import { useState, useRef } from 'react'
import { useHQFinance, useAddHQFinanceDoc, useUpdateHQFinanceDoc } from '../../hooks/useHQFinance'
import {
  FINANCE_DOC_TYPE_LABELS, FINANCE_DOC_STATUS_LABELS,
  type HQFinanceDoc, type FinanceDocType, type FinanceDocStatus,
} from '../../types'
import { useAuth } from '../../context/AuthContext'

const DOC_TYPES = Object.entries(FINANCE_DOC_TYPE_LABELS) as [FinanceDocType, string][]
const DOC_STATUSES = Object.entries(FINANCE_DOC_STATUS_LABELS) as [FinanceDocStatus, string][]

const STATUS_COLORS: Record<FinanceDocStatus, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  final: 'bg-green-100 text-green-700',
  submitted: 'bg-blue-100 text-blue-700',
}

const MAX_DATA_URI_SIZE = 700_000

interface FormState {
  title: string
  docType: FinanceDocType
  period: string
  status: FinanceDocStatus
  notes: string
}

function emptyForm(): FormState {
  return { title: '', docType: 'audited', period: '', status: 'final', notes: '' }
}

function DocRow({ doc: d, isAdmin, onEdit }: { doc: HQFinanceDoc; isAdmin: boolean; onEdit: (d: HQFinanceDoc) => void }) {
  const [open, setOpen] = useState(false)
  const date = d.updatedAt?.toDate?.().toLocaleDateString('he-IL') ?? ''

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-right px-4 py-3.5 hover:bg-gray-50 transition-colors flex items-center gap-3"
      >
        <span className="text-lg shrink-0">📄</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status]}`}>
              {FINANCE_DOC_STATUS_LABELS[d.status]}
            </span>
            <span className="text-xs text-gray-400">{FINANCE_DOC_TYPE_LABELS[d.docType]}</span>
            {d.period && <span className="text-xs text-gray-400">{d.period}</span>}
          </div>
          <div className="font-semibold text-sm" style={{ color: '#141348' }}>{d.title}</div>
        </div>
        {date && <span className="text-xs text-gray-300 shrink-0">{date}</span>}
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

function DocForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: HQFinanceDoc
  onSave: (form: FormState, file?: File) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? { title: initial.title, docType: initial.docType, period: initial.period, status: initial.status, notes: initial.notes ?? '' }
      : emptyForm()
  )
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_DATA_URI_SIZE) {
      setErr(`הקובץ גדול מדי (${(f.size / 1024 / 1024).toFixed(1)}MB). לקבצים מעל 700KB נדרש Firebase Storage — ראה הוראות בתיעוד.`)
      return
    }
    setErr('')
    setFile(f)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.period.trim()) { setErr('שדות חובה: כותרת ותקופה'); return }
    setSaving(true)
    try {
      await onSave(form, file ?? undefined)
      onClose()
    } catch {
      setErr('שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        dir="rtl"
      >
        <h2 className="text-lg font-bold" style={{ color: '#141348' }}>
          {initial ? 'עריכת מסמך' : 'הוספת דוח / מסמך כספי'}
        </h2>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">כותרת *</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder='דו"ח כספי מבוקר 2024'
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">סוג</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.docType} onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value as FinanceDocType }))}
            >
              {DOC_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">סטטוס</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FinanceDocStatus }))}
            >
              {DOC_STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">תקופה *</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
            placeholder='2024 או 1.1.24–30.6.24'
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">קובץ (PDF / Excel / Word)</label>
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:border-indigo-300 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" className="hidden" onChange={handleFile} />
            {file ? (
              <span className="text-sm text-green-700 font-medium">✓ {file.name}</span>
            ) : (
              <span className="text-sm text-gray-400">לחץ לבחירת קובץ (עד 700KB)</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">הערות</label>
          <textarea
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
            rows={2}
            value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">ביטול</button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg text-white font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#141348' }}
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function FinanceTab() {
  const { docs, loading } = useHQFinance()
  const addDoc = useAddHQFinanceDoc()
  const updateDoc = useUpdateHQFinanceDoc()
  const { access } = useAuth()
  const isAdmin = access === 'admin' || access === 'hq'

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HQFinanceDoc | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const readFileAsDataUri = (file: File): Promise<{ fileUrl: string; fileName: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ fileUrl: reader.result as string, fileName: file.name })
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleSave = async (form: FormState, file?: File) => {
    let fileData: { fileUrl?: string; fileName?: string } = {}
    if (file) {
      const { fileUrl, fileName } = await readFileAsDataUri(file)
      fileData = { fileUrl, fileName }
    }
    if (editing) {
      await updateDoc(editing.id, { ...form, ...fileData })
    } else {
      await addDoc({ ...form, ...fileData, active: true })
    }
  }

  const filtered = docs.filter((d) => {
    if (typeFilter !== 'all' && d.docType !== typeFilter) return false
    if (search && !d.title.includes(search) && !d.period.includes(search)) return false
    return true
  })

  const grouped = filtered.reduce<Record<string, HQFinanceDoc[]>>((acc, d) => {
    const key = d.period || 'ללא תקופה'
    ;(acc[key] ??= []).push(d)
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
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">כל הסוגים</option>
          {Object.entries(FINANCE_DOC_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {isAdmin && (
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="px-4 py-2 text-sm rounded-lg text-white font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#141348' }}
          >
            + הוספה
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">אין מסמכים</div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([period, items]) => (
            <div key={period}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{period}</h3>
              <div className="flex flex-col gap-2">
                {items.map((d) => (
                  <DocRow key={d.id} doc={d} isAdmin={isAdmin} onEdit={(d) => { setEditing(d); setShowForm(true) }} />
                ))}
              </div>
            </div>
          ))
      )}

      {showForm && (
        <DocForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
