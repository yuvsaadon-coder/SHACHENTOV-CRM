import { useEffect, useState } from 'react'
import type { AppUser, Domain, OrgRole, RoleLevel, RoleStatus, RolePriority, RecruitmentUrgency, StoredOrgRole } from '../../types'
import {
  DOMAINS, DOMAIN_LABELS, ROLE_LEVELS, ROLE_STATUS_LABELS, ROLE_PRIORITY_LABELS,
  RECRUITMENT_URGENCY_OPTIONS, RECRUITMENT_NEEDS_STATUS,
} from '../../types'
import { useAllBranches } from '../../hooks/useBranch'
import { useToast } from '../../context/ToastContext'
import { assignRole, deleteRole, saveRole, unassignRole } from '../../lib/people'
import { domainOfRole, isActive } from '../../lib/peopleLogic'
import { PersonEditModal } from '../people/PersonEditModal'

interface Props {
  role: OrgRole | null
  allRoles: OrgRole[]
  people: AppUser[]
  onClose: () => void
}

const EMPTY: StoredOrgRole = {
  roleName: '',
  level: 'מטה',
  area: '',
  status: 'חסר',
  priority: 'רגיל',
  linkedTaskIds: [],
  affectsTasks: false,
  delegatedTo: null,
  notes: '',
  reportsTo: undefined,
  portalBranchId: undefined,
  domain: undefined,
}

function toForm(role: OrgRole | null): StoredOrgRole {
  if (!role) return { ...EMPTY }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, holders, holderName, phone, email, ...stored } = role
  return { ...EMPTY, ...stored }
}

type PersonDialog = { mode: 'new' } | { mode: 'edit'; uid: string } | null

export function RoleEditModal({ role, allRoles, people, onClose }: Props) {
  const { toast } = useToast()
  const [createdId, setCreatedId] = useState<string | null>(null)
  const roleId = role?.id ?? createdId
  // The live copy, so holders and staffing status follow every assignment made from here.
  const live = roleId ? allRoles.find((r) => r.id === roleId) ?? role : null

  const [form, setForm] = useState<StoredOrgRole>(toForm(role))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [busyHolder, setBusyHolder] = useState<string | null>(null)
  const [personDialog, setPersonDialog] = useState<PersonDialog>(null)
  const [error, setError] = useState<string | null>(null)
  const { branches } = useAllBranches()
  const org = { people, roles: allRoles }

  useEffect(() => {
    setForm(toForm(role))
    setCreatedId(null)
    setError(null)
    setConfirmDelete(false)
  }, [role])

  const liveStatus = live?.status
  useEffect(() => {
    if (liveStatus) setForm((f) => (f.status === liveStatus ? f : { ...f, status: liveStatus }))
  }, [liveStatus])

  const set = <K extends keyof StoredOrgRole>(key: K, value: StoredOrgRole[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.roleName.trim()) { setError('שם תפקיד הוא שדה חובה'); return }
    setSaving(true)
    setError(null)
    try {
      const id = await saveRole(roleId, { ...form, roleName: form.roleName.trim() }, org)
      if (roleId) {
        onClose()
      } else {
        // Stay open: a new position usually gets a person right away.
        setCreatedId(id)
        setSaving(false)
        toast('התפקיד נוצר — אפשר לשייך אליו אנשים', 'success')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!live) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    setError(null)
    try {
      await deleteRole(live, org)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה במחיקה')
      setDeleting(false)
    }
  }

  const holders = live?.holders ?? []
  const candidates = people.filter((p) => isActive(p) && !holders.some((h) => h.uid === p.uid))

  const withHolder = async (uid: string, action: (person: AppUser) => Promise<void>) => {
    const person = people.find((p) => p.uid === uid)
    if (!person) return
    setBusyHolder(uid)
    setError(null)
    try {
      await action(person)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בעדכון')
    } finally {
      setBusyHolder(null)
      setConfirmRemove(null)
    }
  }

  const assign = (uid: string) => {
    if (!uid || !live) return
    void withHolder(uid, (person) => assignRole(person, live.id, org))
  }

  const remove = (uid: string) => {
    if (!live) return
    if (confirmRemove !== uid) { setConfirmRemove(uid); return }
    void withHolder(uid, (person) => unassignRole(person, live.id, org))
  }

  const parentOptions = allRoles.filter((r) => r.id !== roleId)
  const autoDomain = domainOfRole({ ...form, domain: undefined })
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]'

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
            {roleId ? 'עריכת תפקיד' : 'תפקיד חדש'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="role-name" className="block text-xs font-medium text-gray-600 mb-1">שם תפקיד *</label>
            <input id="role-name" value={form.roleName} onChange={(e) => set('roleName', e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">רמה</label>
              <select value={form.level} onChange={(e) => set('level', e.target.value as RoleLevel)} className={inputCls}>
                {ROLE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">אזור</label>
              <input value={form.area} onChange={(e) => set('area', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Holders — people from the directory, never free text */}
          <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/60">
            <div className="text-xs font-medium text-gray-600 mb-2">ממלאי התפקיד</div>
            {!live ? (
              <p className="text-xs text-gray-400">אחרי שמירת התפקיד אפשר לשייך אליו אנשים.</p>
            ) : (
              <div className="space-y-2">
                {holders.length === 0 && <p className="text-xs text-gray-400">התפקיד אינו מאויש.</p>}
                {holders.map((h) => (
                  <div key={h.uid} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: '#141348' }}>{h.name}</div>
                      <div className="text-xs text-gray-400 truncate" dir="ltr">
                        {[h.phone, h.email].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <button type="button" onClick={() => setPersonDialog({ mode: 'edit', uid: h.uid })}
                      className="text-xs text-[#189A9F] hover:underline shrink-0">פרטים</button>
                    <button type="button" onClick={() => remove(h.uid)} disabled={busyHolder === h.uid}
                      className={`text-xs shrink-0 rounded px-2 py-1 disabled:opacity-40 ${
                        confirmRemove === h.uid ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'
                      }`}>
                      {busyHolder === h.uid ? '…' : confirmRemove === h.uid ? 'אשר הסרה' : 'הסר מהתפקיד'}
                    </button>
                  </div>
                ))}
                {confirmRemove && (
                  <p className="text-xs text-amber-700">ההסרה שומרת את הפרטים באנשי קשר תחת "בעלי תפקידים לשעבר".</p>
                )}
                <div className="flex gap-2">
                  <select value="" onChange={(e) => assign(e.target.value)} aria-label="שיוך אדם קיים לתפקיד"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#189A9F]">
                    <option value="">+ שיוך אדם קיים…</option>
                    {candidates.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setPersonDialog({ mode: 'new' })}
                    className="text-xs border border-gray-200 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50 shrink-0">
                    + אדם חדש
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סטטוס</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value as RoleStatus)} className={inputCls}>
                {ROLE_STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">עדיפות</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value as RolePriority)} className={inputCls}>
                {ROLE_PRIORITY_LABELS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {RECRUITMENT_NEEDS_STATUS.includes(form.status) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סטטוס גיוס</label>
              <select
                value={form.recruitmentUrgency ?? 'לא לגיוס'}
                onChange={(e) => set('recruitmentUrgency', e.target.value as RecruitmentUrgency)}
                className={inputCls}
              >
                {RECRUITMENT_URGENCY_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">כפוף ל-</label>
            <select value={form.reportsTo ?? ''} onChange={(e) => set('reportsTo', e.target.value || undefined)} className={inputCls}>
              <option value="">— ללא (שורש) —</option>
              {parentOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roleName}{r.holderName ? ` (${r.holderName})` : ''}
                </option>
              ))}
            </select>
          </div>

          {form.level === 'מטה' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">תחום משימות</label>
              <select value={form.domain ?? ''} onChange={(e) => set('domain', (e.target.value || undefined) as Domain | undefined)} className={inputCls}>
                <option value="">{autoDomain ? `אוטומטי — ${DOMAIN_LABELS[autoDomain]}` : '— ללא תחום —'}</option>
                {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">קובע אילו משימות יוצגו כברירת מחדל למי שממלא את התפקיד.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">מואצל ל-</label>
            <input value={form.delegatedTo ?? ''} onChange={(e) => set('delegatedTo', e.target.value || null)} className={inputCls} />
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
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={`${inputCls} resize-none`} />
          </div>

          {branches.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סניף פורטל מקושר</label>
              <select value={form.portalBranchId ?? ''} onChange={(e) => set('portalBranchId', e.target.value || undefined)} className={inputCls}>
                <option value="">— ללא קישור —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">ממלאי התפקיד הם רכזי הסניף: הם רואים אותו בפורטל הרכזים ומדווחים עליו.</p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 items-center">
          <button
            onClick={() => void save()}
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
            {roleId ? 'סגור' : 'ביטול'}
          </button>
          {live && (
            <button
              onClick={() => void handleDelete()}
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

      {personDialog && live && (
        <div onClick={(e) => e.stopPropagation()}>
          <PersonEditModal
            person={personDialog.mode === 'edit' ? people.find((p) => p.uid === personDialog.uid) ?? null : null}
            org={org}
            presetRoleId={personDialog.mode === 'new' ? live.id : undefined}
            onClose={() => setPersonDialog(null)}
          />
        </div>
      )}
    </div>
  )
}
