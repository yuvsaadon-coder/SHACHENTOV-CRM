import { useState } from 'react'
import { useHQPartners, useAddHQPartner, useUpdateHQPartner } from '../../hooks/useHQPartners'
import {
  PARTNER_TYPE_LABELS, PARTNER_STATUS_LABELS, PARTNER_CAT_LABELS,
  PAYMENT_METHOD_LABELS, RECEIPT_GEN_LABELS, PARTNER_USED_FOR_LABELS,
  type HQPartner, type PartnerType, type PartnerStatus, type PartnerCategory,
  type PaymentMethod, type ReceiptGeneration, type PartnerUsedFor,
} from '../../types'
import { useAuth } from '../../context/AuthContext'

const PARTNER_TYPES = Object.entries(PARTNER_TYPE_LABELS) as [PartnerType, string][]
const PARTNER_STATUSES = Object.entries(PARTNER_STATUS_LABELS) as [PartnerStatus, string][]
const PARTNER_CATS = Object.entries(PARTNER_CAT_LABELS) as [PartnerCategory, string][]
const PAYMENT_METHODS = Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]
const RECEIPT_GENS = Object.entries(RECEIPT_GEN_LABELS) as [ReceiptGeneration, string][]
const USED_FORS = Object.entries(PARTNER_USED_FOR_LABELS) as [PartnerUsedFor, string][]

const STATUS_COLORS: Record<PartnerStatus, string> = {
  active: 'bg-green-100 text-green-700',
  pilot: 'bg-blue-100 text-blue-700',
  potential: 'bg-yellow-100 text-yellow-800',
  inactive: 'bg-gray-100 text-gray-500',
}

interface FormState {
  name: string
  partnerType: PartnerType
  categories: PartnerCategory[]
  status: PartnerStatus
  websiteUrl: string
  adminUrl: string
  notes: string
  paymentMethods: PaymentMethod[]
  receiptGeneration: ReceiptGeneration | ''
  usedFor: PartnerUsedFor[]
}

function emptyForm(): FormState {
  return { name: '', partnerType: 'partner', categories: [], status: 'potential', websiteUrl: '', adminUrl: '', notes: '', paymentMethods: [], receiptGeneration: '', usedFor: [] }
}

function toggleArr<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]
}

function CheckboxGroup<T extends string>({ label, options, value, onChange }: { label: string; options: [T, string][]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(([k, v]) => (
          <label key={k} className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" className="rounded" checked={value.includes(k)} onChange={() => onChange(toggleArr(value, k))} />
            <span className="text-sm text-gray-700">{v}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function PartnerForm({ initial, onSave, onClose }: { initial?: HQPartner; onSave: (form: FormState, prevStatus?: PartnerStatus) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          partnerType: initial.partnerType,
          categories: initial.categories,
          status: initial.status,
          websiteUrl: initial.websiteUrl ?? '',
          adminUrl: initial.adminUrl ?? '',
          notes: initial.notes ?? '',
          paymentMethods: initial.paymentMethods ?? [],
          receiptGeneration: initial.receiptGeneration ?? '',
          usedFor: initial.usedFor ?? [],
        }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setErr('שם חובה'); return }
    setSaving(true)
    try { await onSave(form, initial?.status); onClose() }
    catch { setErr('שגיאה בשמירה') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        dir="rtl"
      >
        <h2 className="text-lg font-bold" style={{ color: '#141348' }}>{initial ? 'עריכת שותף' : 'הוספת שותף / פלטפורמה'}</h2>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">שם *</label>
          <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">סוג</label>
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.partnerType} onChange={(e) => setForm((f) => ({ ...f, partnerType: e.target.value as PartnerType }))}>
              {PARTNER_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">סטטוס</label>
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PartnerStatus }))}>
              {PARTNER_STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <CheckboxGroup label="קטגוריות" options={PARTNER_CATS} value={form.categories} onChange={(v) => setForm((f) => ({ ...f, categories: v }))} />

        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">אתר</label>
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" type="url" value={form.websiteUrl} onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">כניסה לניהול</label>
            <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm" type="url" value={form.adminUrl} onChange={(e) => setForm((f) => ({ ...f, adminUrl: e.target.value }))} dir="ltr" />
          </div>
        </div>

        {form.partnerType === 'payment' && (
          <>
            <CheckboxGroup label="אמצעי תשלום" options={PAYMENT_METHODS} value={form.paymentMethods} onChange={(v) => setForm((f) => ({ ...f, paymentMethods: v }))} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">הנפקת קבלות</label>
              <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.receiptGeneration} onChange={(e) => setForm((f) => ({ ...f, receiptGeneration: e.target.value as ReceiptGeneration | '' }))}>
                <option value="">— בחר —</option>
                {RECEIPT_GENS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <CheckboxGroup label="שימוש עבור" options={USED_FORS} value={form.usedFor} onChange={(v) => setForm((f) => ({ ...f, usedFor: v }))} />
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">הערות</label>
          <textarea className="border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>

        {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{err}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">ביטול</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg text-white font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </form>
    </div>
  )
}

function PartnerCard({ partner: p, isAdmin, onEdit }: { partner: HQPartner; isAdmin: boolean; onEdit: (p: HQPartner) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-right px-4 py-3.5 hover:bg-gray-50 transition-colors flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-white text-sm" style={{ backgroundColor: '#141348' }}>
          {p.name.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm mb-1" style={{ color: '#141348' }}>{p.name}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>{PARTNER_STATUS_LABELS[p.status]}</span>
            <span className="text-xs text-gray-400">{PARTNER_TYPE_LABELS[p.partnerType]}</span>
          </div>
        </div>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-3">
          {p.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {p.categories.map((c) => (
                <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{PARTNER_CAT_LABELS[c]}</span>
              ))}
            </div>
          )}

          {p.paymentMethods && p.paymentMethods.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-1">אמצעי תשלום</div>
              <div className="flex flex-wrap gap-1">
                {p.paymentMethods.map((m) => (
                  <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{PAYMENT_METHOD_LABELS[m]}</span>
                ))}
              </div>
            </div>
          )}

          {p.receiptGeneration && (
            <div className="text-sm text-gray-600">הנפקת קבלות: <span className="font-medium">{RECEIPT_GEN_LABELS[p.receiptGeneration]}</span></div>
          )}

          {p.usedFor && p.usedFor.length > 0 && (
            <div className="text-sm text-gray-600">שימוש עבור: {p.usedFor.map((u) => PARTNER_USED_FOR_LABELS[u]).join(', ')}</div>
          )}

          {p.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{p.notes}</p>}

          <div className="flex gap-2 flex-wrap">
            {p.websiteUrl && (
              <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100">🌐 אתר</a>
            )}
            {p.adminUrl && (
              <a href={p.adminUrl} target="_blank" rel="noopener noreferrer" className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100">⚙️ ניהול</a>
            )}
            {isAdmin && (
              <button onClick={() => onEdit(p)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100">✏️ עריכה</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function PartnersTab() {
  const { partners, loading } = useHQPartners()
  const addPartner = useAddHQPartner()
  const updatePartner = useUpdateHQPartner()
  const { access } = useAuth()
  const isAdmin = access === 'admin' || access === 'hq'

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HQPartner | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const handleSave = async (form: FormState, prevStatus?: PartnerStatus) => {
    const data = {
      name: form.name,
      partnerType: form.partnerType,
      categories: form.categories,
      status: form.status,
      websiteUrl: form.websiteUrl || undefined,
      adminUrl: form.adminUrl || undefined,
      notes: form.notes || undefined,
      paymentMethods: form.paymentMethods.length > 0 ? form.paymentMethods : undefined,
      receiptGeneration: (form.receiptGeneration || undefined) as ReceiptGeneration | undefined,
      usedFor: form.usedFor.length > 0 ? form.usedFor : undefined,
      active: true,
    }
    if (editing) await updatePartner(editing.id, data, prevStatus)
    else await addPartner(data)
  }

  const filtered = partners.filter((p) => {
    if (typeFilter !== 'all' && p.partnerType !== typeFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (search && !p.name.includes(search)) return false
    return true
  })

  const grouped = filtered.reduce<Record<string, HQPartner[]>>((acc, p) => {
    const key = PARTNER_TYPE_LABELS[p.partnerType]
    ;(acc[key] ??= []).push(p)
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
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">כל הסוגים</option>
          {PARTNER_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">כל הסטטוסים</option>
          {PARTNER_STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
        <div className="text-sm text-gray-400 py-8 text-center">אין שותפים</div>
      ) : (
        Object.entries(grouped).map(([type, items]) => (
          <div key={type}>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{type}</h3>
            <div className="flex flex-col gap-2">
              {items.map((p) => (
                <PartnerCard key={p.id} partner={p} isAdmin={isAdmin} onEdit={(p) => { setEditing(p); setShowForm(true) }} />
              ))}
            </div>
          </div>
        ))
      )}

      {showForm && (
        <PartnerForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
