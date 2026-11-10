import { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAllBranches } from '../../hooks/useBranch'
import { useUserSecrets } from '../../hooks/useUserSecrets'
import { ensureLogin, savePerson, type OrgData } from '../../lib/people'
import {
  accessOf, branchIdsFor, digitsOnly, inputFromPerson, isActive, roleLabel, validatePerson,
  type PersonInput,
} from '../../lib/peopleLogic'
import type { AccessLevel, AppUser } from '../../types'
import { ROLE_LEVELS } from '../../types'

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  none: 'ללא גישה למערכת',
  coordinator: 'פורטל רכזים',
  hq: 'מטה',
  admin: 'מנהל/ת מערכת',
}

const ACCESS_HINT: Record<AccessLevel, string> = {
  none: 'מופיע/ה בעץ הארגוני ובאנשי הקשר, בלי כניסה למערכת.',
  coordinator: 'כניסה לפורטל הרכזים עם שם מלא + מספר טלפון.',
  hq: 'כניסה לסביבת המטה עם אימייל + סיסמה.',
  admin: 'כמו מטה, ובנוסף ניהול הרשאות וצפייה בסיסמאות.',
}

const EMPTY: PersonInput = { name: '', phone: '', email: '', access: 'none', roleIds: [], active: true }

interface Props {
  person: AppUser | null
  org: OrgData
  /** Position to pre-select when adding a new person from a role. */
  presetRoleId?: string
  onClose: () => void
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F] disabled:bg-gray-50 disabled:text-gray-400'

export function PersonEditModal({ person, org, presetRoleId, onClose }: Props) {
  const { appUser, isManager } = useAuth()
  // Password management set for this person's HQ login, when known (managers only).
  const knownPassword = useUserSecrets(isManager)[person?.uid ?? '']
  const { toast } = useToast()
  const { branches } = useAllBranches()

  const presetRole = presetRoleId ? org.roles.find((r) => r.id === presetRoleId) : undefined
  const [form, setForm] = useState<PersonInput>(() => {
    if (person) return inputFromPerson(person)
    return {
      ...EMPTY,
      roleIds: presetRole ? [presetRole.id] : [],
      access: presetRole?.portalBranchId ? 'coordinator' : 'none',
    }
  })
  const [accessTouched, setAccessTouched] = useState(!!person)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isSelf = !!person && person.uid === appUser?.uid
  const prevAccess = person ? accessOf(person) : 'none'
  const targetIsStaff = prevAccess === 'hq' || prevAccess === 'admin'
  // Non-managers may edit details and positions, but not who gets HQ access.
  const canChangeAccess = isManager ? !isSelf : !targetIsStaff
  const allowedAccess: AccessLevel[] = isManager ? ['none', 'coordinator', 'hq', 'admin'] : ['none', 'coordinator']
  // A staff member's e-mail and phone are what their login hangs on.
  const canEditLoginDetails = isManager || !targetIsStaff

  const set = <K extends keyof PersonInput>(key: K, value: PersonInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const rolesById = useMemo(() => new Map(org.roles.map((r) => [r.id, r])), [org.roles])
  const chosenRoles = form.roleIds.map((id) => rolesById.get(id)).filter((r) => !!r)
  const portalBranches = branchIdsFor(form.roleIds, org.roles)
    .map((id) => branches.find((b) => b.id === id)?.name ?? id)

  const addRole = (roleId: string) => {
    if (!roleId || form.roleIds.includes(roleId)) return
    const role = rolesById.get(roleId)
    setForm((f) => ({
      ...f,
      roleIds: [...f.roleIds, roleId],
      access: !accessTouched && f.access === 'none' && role?.portalBranchId ? 'coordinator' : f.access,
    }))
  }

  const removeRole = (roleId: string) => set('roleIds', form.roleIds.filter((id) => id !== roleId))

  const isStaff = form.access === 'hq' || form.access === 'admin'
  const phoneDigits = digitsOnly(form.phone)

  const handleSave = async () => {
    const problem = validatePerson(form, person?.uid ?? null, org.people)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError('')
    try {
      const id = await savePerson(person?.uid ?? null, form, org)

      const emailChanged = (person?.email ?? '').trim().toLowerCase() !== form.email.trim().toLowerCase()
      const passwordFollowsPhone = !!knownPassword && knownPassword === digitsOnly(person?.phone)
        && phoneDigits !== knownPassword
      const needsLogin = isManager && isStaff && form.active && !isSelf
        && (!person || !targetIsStaff || emailChanged || passwordFollowsPhone)
      if (needsLogin) {
        try {
          const password = await ensureLogin(id)
          toast(`נשמר. כניסה למטה: ${form.email.trim().toLowerCase()} · סיסמה: ${password}`, 'success')
        } catch (e) {
          setError(`הפרטים נשמרו, אך הגדרת הכניסה למערכת נכשלה: ${e instanceof Error ? e.message : String(e)}`)
          setSaving(false)
          return
        }
      } else {
        toast(person ? 'הפרטים עודכנו' : 'האדם נוסף', 'success')
      }
      onClose()
    } catch (e) {
      setError('שגיאה בשמירה — ' + (e instanceof Error ? e.message : String(e)))
      setSaving(false)
    }
  }

  const handleResetPassword = async () => {
    if (!person) return
    setResetting(true)
    setError('')
    try {
      const password = await ensureLogin(person.uid)
      setShowPassword(true)
      toast(`הסיסמה אופסה ל-${password}`, 'success')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setResetting(false)
    }
  }

  const leaving = person && isActive(person)
    ? (person.roleIds ?? []).filter((id) => rolesById.has(id) && (!form.active || !form.roleIds.includes(id)))
    : []

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
        role="dialog"
        aria-label={person ? 'עריכת אדם' : 'הוספת אדם'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between z-10">
          <h2 className="font-bold" style={{ color: '#141348' }}>{person ? 'עריכת אדם' : 'הוספת אדם'}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none" aria-label="סגור">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="person-name" className="block text-xs text-gray-500 mb-1">שם מלא *</label>
            <input id="person-name" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="person-phone" className="block text-xs text-gray-500 mb-1">טלפון</label>
              <input id="person-phone" type="tel" dir="ltr" value={form.phone} disabled={!canEditLoginDetails}
                onChange={(e) => set('phone', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="person-email" className="block text-xs text-gray-500 mb-1">אימייל</label>
              <input id="person-email" type="email" dir="ltr" value={form.email} disabled={!canEditLoginDetails}
                onChange={(e) => set('email', e.target.value)} className={inputCls} />
            </div>
          </div>
          {!canEditLoginDetails && (
            <p className="text-xs text-gray-400 -mt-2">טלפון ואימייל של איש/אשת מטה משמשים לכניסה — שינוי רק ע״י מנהל/ת מערכת.</p>
          )}

          {/* Positions */}
          <div>
            <label htmlFor="person-add-role" className="block text-xs text-gray-500 mb-1">תפקידים בארגון</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {chosenRoles.map((r) => (
                <span key={r.id} className="text-xs bg-[#E6F4F4] text-[#147F84] rounded-full pr-2.5 pl-1.5 py-1 flex items-center gap-1">
                  {roleLabel(r)}
                  <span className="text-[#147F84]/60">· {r.level}</span>
                  <button type="button" onClick={() => removeRole(r.id)} aria-label={`הסר מהתפקיד ${r.roleName}`}
                    className="text-red-400 hover:text-red-600 leading-none text-sm px-0.5">×</button>
                </span>
              ))}
              {chosenRoles.length === 0 && <span className="text-xs text-gray-400">לא משויך/ת לתפקיד</span>}
            </div>
            <select id="person-add-role" value="" onChange={(e) => addRole(e.target.value)} className={inputCls}>
              <option value="">+ שיוך לתפקיד…</option>
              {ROLE_LEVELS.map((level) => {
                const options = org.roles.filter((r) => r.level === level && !form.roleIds.includes(r.id))
                if (options.length === 0) return null
                return (
                  <optgroup key={level} label={level}>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>
                        {roleLabel(r)}{r.holderName ? ` (כיום: ${r.holderName})` : ' (לא מאויש)'}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            {leaving.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                בשמירה: {form.name || 'האדם'} יוסר/תוסר מ-{leaving.map((id) => rolesById.get(id)!.roleName).join(', ')},
                והפרטים יישמרו באנשי קשר תחת "בעלי תפקידים לשעבר".
              </p>
            )}
          </div>

          {/* Access */}
          <div>
            <label htmlFor="person-access" className="block text-xs text-gray-500 mb-1">גישה למערכת</label>
            <select
              id="person-access"
              value={form.access}
              disabled={!canChangeAccess}
              onChange={(e) => { setAccessTouched(true); set('access', e.target.value as AccessLevel) }}
              className={inputCls}
            >
              {(Object.keys(ACCESS_LABELS) as AccessLevel[]).map((a) => (
                <option key={a} value={a} disabled={!allowedAccess.includes(a) && a !== form.access}>
                  {ACCESS_LABELS[a]}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {ACCESS_HINT[form.access]}
              {!canChangeAccess && (isSelf ? ' לא ניתן לשנות את הגישה של עצמך.' : ' שינוי גישת מטה — רק ע״י מנהל/ת מערכת.')}
            </p>

            {form.access === 'coordinator' && (
              <div className="text-xs rounded-lg px-3 py-2 mt-2 bg-gray-50 text-gray-600 space-y-0.5">
                <div>שם לכניסה: <strong>{form.name.trim() || '—'}</strong> · טלפון: <strong dir="ltr">{phoneDigits || '—'}</strong></div>
                {portalBranches.length > 0
                  ? <div>סניפים בפורטל: {portalBranches.join(', ')}</div>
                  : <div className="text-amber-700">אף אחד מהתפקידים שנבחרו אינו מקושר לסניף בפורטל — הרכז/ת לא יראה סניף.</div>}
              </div>
            )}

            {isStaff && isManager && person && targetIsStaff && !isSelf && (
              <div className="text-xs rounded-lg px-3 py-2 mt-2 bg-gray-50 text-gray-600 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    סיסמה:{' '}
                    {knownPassword
                      ? <strong dir="ltr" className="font-mono select-all">{showPassword ? knownPassword : '••••••••'}</strong>
                      : <span className="text-gray-400">לא ידועה (נקבעה בעבר או שונתה ע״י המשתמש/ת)</span>}
                  </span>
                  {knownPassword && (
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-[#189A9F] hover:underline shrink-0">
                      {showPassword ? 'הסתר' : 'הצג'}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => void handleResetPassword()} disabled={resetting || phoneDigits.length < 6}
                  className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">
                  {resetting ? 'מאפס…' : 'אפס סיסמה למספר הטלפון'}
                </button>
              </div>
            )}
            {isStaff && isManager && (!person || !targetIsStaff) && (
              <p className="text-xs rounded-lg px-3 py-2 mt-2 bg-gray-50 text-gray-600">
                בשמירה תיפתח כניסה למטה עם האימייל, והסיסמה תהיה מספר הטלפון.
              </p>
            )}
          </div>

          {person && (
            <div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="person-active" checked={form.active} disabled={isSelf || (!isManager && targetIsStaff)}
                  onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 accent-[#189A9F]" />
                <label htmlFor="person-active" className="text-sm">פעיל/ה בעמותה</label>
              </div>
              {!form.active && (
                <p className="text-xs text-gray-400 mt-1">
                  אדם לא פעיל מוסר מכל תפקידיו ומאבד גישה למערכת. הרשומה נשמרת וניתן להחזיר אותו.
                </p>
              )}
            </div>
          )}

          {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2" role="alert">{error}</div>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={() => void handleSave()} disabled={saving}
            className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר…' : 'שמור'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50">ביטול</button>
        </div>
      </div>
    </div>
  )
}
