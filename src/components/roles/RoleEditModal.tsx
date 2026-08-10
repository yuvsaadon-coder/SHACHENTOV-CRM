import { useState, useEffect } from 'react'
import { doc, updateDoc, addDoc, collection, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import type { OrgRole, RoleLevel, RoleStatus, RolePriority } from '../../types'
import { ROLE_LEVELS, ROLE_STATUS_LABELS, ROLE_PRIORITY_LABELS } from '../../types'
import { useAllBranches } from '../../hooks/useBranch'

interface Props {
  role: OrgRole | null
  allRoles: OrgRole[]
  onClose: () => void
}

const EMPTY: Omit<OrgRole, 'id'> = {
  roleName: '',
  level: 'מטה',
  area: '',
  holderName: '',
  status: 'חסר',
  priority: 'רגיל',
  email: '',
  phone: '',
  linkedTaskIds: [],
  affectsTasks: false,
  delegatedTo: null,
  notes: '',
  reportsTo: undefined,
  portalBranchId: undefined,
}

export function RoleEditModal({ role, allRoles, onClose }: Props) {
  const [form, setForm] = useState<Omit<OrgRole, 'id'>>(role ? { ...EMPTY, ...role } : { ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { branches } = useAllBranches()

  useEffect(() => {
    setForm(role ? { ...EMPTY, ...role } : { ...EMPTY })
    setError(null)
    setConfirmDelete(false)
  }, [role])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.roleName.trim()) { setError('שם תפקיד הוא שדה חובה'); return }
    setSaving(true)
    setError(null)
    try {
      const data: Record<string, unknown> = { ...form }
      if (!data.reportsTo) delete data.reportsTo
      if (role) {
        await updateDoc(doc(db, 'roles', role.id), data)
      } else {
        await addDoc(collection(db, 'roles'), data)
      }
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!role) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    setError(null)
    try {
      await deleteDoc(doc(db, 'roles', role.id))
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה במחיקה')
      setDeleting(false)
    }
  }

  const parentOptions = allRoles.filter((r) => r.id !== role?.id)

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: '#141348' }}>
            {role ? 'עריכת תפקיד' : 'תפקיד חדש'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">שם תפקיד *</label>
            <input
              value={form.roleName}
              onChange={(e) => set('roleName', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">רמה</label>
              <select
                value={form.level}
                onChange={(e) => set('level', e.target.value as RoleLevel)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              >
                {ROLE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">אזור</label>
              <input
                value={form.area}
                onChange={(e) => set('area', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ממלא תפקיד</label>
            <input
              value={form.holderName}
              onChange={(e) => set('holderName', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סטטוס</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value as RoleStatus)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              >
                {ROLE_STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">עדיפות</label>
              <select
                value={form.priority}
                onChange={(e) => set('priority', e.target.value as RolePriority)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              >
                {ROLE_PRIORITY_LABELS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">כפוף ל-</label>
            <select
              value={form.reportsTo ?? ''}
              onChange={(e) => set('reportsTo', e.target.value || undefined)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            >
              <option value="">— ללא (שורש) —</option>
              {parentOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roleName}{r.holderName ? ` (${r.holderName})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">טלפון</label>
              <input
                type="tel"
                dir="ltr"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">אימייל</label>
              <input
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">מואצל ל-</label>
            <input
              value={form.delegatedTo ?? ''}
              onChange={(e) => set('delegatedTo', e.target.value || null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="affectsTasks"
              checked={form.affectsTasks}
              onChange={(e) => set('affectsTasks', e.target.checked)}
              className="w-4 h-4"
              style={{ accentColor: '#189A9F' }}
            />
            <label htmlFor="affectsTasks" className="text-sm text-gray-700">
              התפקיד משפיע על משימות
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">הערות</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F] resize-none"
            />
          </div>

          {branches.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סניף פורטל מקושר</label>
              <select
                value={form.portalBranchId ?? ''}
                onChange={(e) => set('portalBranchId', e.target.value || undefined)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              >
                <option value="">— ללא קישור —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">מאפשר צפייה בדיווחים הרבעוניים של הסניף מתוך המבנה הארגוני</p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 items-center">
          <button
            onClick={save}
            disabled={saving || deleting}
            className="px-5 py-2 text-sm rounded-lg text-white font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#141348' }}
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ביטול
          </button>
          {role && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className={`mr-auto px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50 ${
                confirmDelete
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-red-300 text-red-600 hover:bg-red-50'
              }`}
            >
              {deleting ? 'מוחק...' : confirmDelete ? 'אשר מחיקה' : 'מחק תפקיד'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
