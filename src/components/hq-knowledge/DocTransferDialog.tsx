import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  DOC_KIND_LABELS, defaultExtras, transferDoc,
  type DocKind, type DocSource, type TransferExtras,
} from '../../lib/hqDocTransfer'
import {
  DRIVE_TYPE_LABELS, DRIVE_CAT_LABELS, FINANCE_DOC_TYPE_LABELS, FINANCE_DOC_STATUS_LABELS, OFFICIAL_DOC_LABELS,
} from '../../types'

const KINDS = Object.keys(DOC_KIND_LABELS) as DocKind[]
const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm'

function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Record<T, string> }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.entries(options) as [T, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  )
}

export function DocTransferDialog({ source, onClose }: { source: DocSource; onClose: () => void }) {
  const { firebaseUser } = useAuth()
  const { toast } = useToast()
  const targets = KINDS.filter((k) => k !== source.kind)
  const [to, setTo] = useState<DocKind>(targets[0])
  const [x, setX] = useState<TransferExtras>(defaultExtras(source))
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof TransferExtras>(k: K, v: TransferExtras[K]) => setX((p) => ({ ...p, [k]: v }))

  const missing = to === 'finance' && !x.period.trim()

  const go = async () => {
    if (!firebaseUser || missing) return
    setBusy(true)
    try {
      await transferDoc(source, to, x, firebaseUser.uid)
      toast(`"${source.name}" הועבר ל${DOC_KIND_LABELS[to]}`, 'success')
      onClose()
    } catch {
      toast('ההעברה נכשלה — לא בוצע שינוי. נסה שוב.', 'error')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full flex flex-col gap-4 max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold" style={{ color: '#141348' }}>העברת מסמך</h2>
        <p className="text-sm text-gray-600">
          להעביר את <span className="font-semibold">"{source.name}"</span> מ{DOC_KIND_LABELS[source.kind]} אל:
        </p>

        <div className="flex gap-2">
          {targets.map((k) => (
            <button key={k} type="button" onClick={() => setTo(k)}
              className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${to === k ? 'bg-indigo-700 text-white border-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {DOC_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {to === 'drive' && (
          <>
            <Select label="סוג" value={x.driveType} onChange={(v) => set('driveType', v)} options={DRIVE_TYPE_LABELS} />
            <Select label="קטגוריה" value={x.category} onChange={(v) => set('category', v)} options={DRIVE_CAT_LABELS} />
          </>
        )}
        {to === 'finance' && (
          <>
            <Select label="סוג מסמך" value={x.docType} onChange={(v) => set('docType', v)} options={FINANCE_DOC_TYPE_LABELS} />
            <Select label="סטטוס" value={x.status} onChange={(v) => set('status', v)} options={FINANCE_DOC_STATUS_LABELS} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">תקופה *</label>
              <input className={inputCls} value={x.period} onChange={(e) => set('period', e.target.value)} placeholder="למשל 2025" />
            </div>
          </>
        )}
        {to === 'official' && (
          <>
            <Select label="סוג טופס" value={x.subtype} onChange={(v) => set('subtype', v)} options={OFFICIAL_DOC_LABELS} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">שנה</label>
                <input className={inputCls} type="number" value={x.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : undefined)} dir="ltr" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">מספר רישום</label>
                <input className={inputCls} value={x.registrationNumber ?? ''} onChange={(e) => set('registrationNumber', e.target.value)} dir="ltr" />
              </div>
            </div>
          </>
        )}

        {!source.url && <p className="text-xs text-orange-600 bg-orange-50 rounded-lg p-2">למסמך אין קובץ או קישור — יועבר ללא קובץ.</p>}
        <p className="text-xs text-gray-400">המסמך יימחק מהמקור ויתווסף ליעד.</p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">ביטול</button>
          <button onClick={() => void go()} disabled={busy || missing}
            className="px-4 py-2 text-sm rounded-lg text-white font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#141348' }}>
            {busy ? 'מעביר...' : 'העבר'}
          </button>
        </div>
      </div>
    </div>
  )
}
