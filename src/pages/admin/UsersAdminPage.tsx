import { useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useRoles } from '../../hooks/useRoles'
import { useUserSecrets } from '../../hooks/useUserSecrets'
import { useToast } from '../../context/ToastContext'
import { Spinner } from '../../components/ui/Spinner'
import { ACCESS_LABELS, PersonEditModal } from '../../components/people/PersonEditModal'
import { ensureLogin } from '../../lib/people'
import { accessOf, digitsOnly, isActive } from '../../lib/peopleLogic'
import type { AccessLevel, AppUser } from '../../types'

const ACCESS_STYLE: Record<AccessLevel, React.CSSProperties> = {
  admin:       { backgroundColor: '#141348', color: '#ffffff' },
  hq:          { backgroundColor: '#E4DFEC', color: '#5F497A' },
  coordinator: { backgroundColor: '#E6F4F4', color: '#147F84' },
  none:        { backgroundColor: '#F3F4F6', color: '#6B7280' },
}

type AccessFilter = AccessLevel | '' | 'unassigned'

export function UsersAdminPage() {
  const { appUser, isManager } = useAuth()
  const { roles, people, loading, error } = useRoles()
  const passwords = useUserSecrets(isManager)
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('')
  const [showInactive, setShowInactive] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)
  const [selected, setSelected] = useState<AppUser | null>(null)
  const [adding, setAdding] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const positionsOf = (p: AppUser) =>
    isActive(p) ? (p.roleIds ?? []).map((id) => rolesById.get(id)).filter((r) => !!r) : []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return people.filter((p) => {
      if (!showInactive && !isActive(p)) return false
      const positions = isActive(p) ? (p.roleIds ?? []).map((id) => rolesById.get(id)).filter((r) => !!r) : []
      if (accessFilter === 'unassigned') { if (positions.length > 0) return false }
      else if (accessFilter && accessOf(p) !== accessFilter) return false
      if (!q) return true
      const qDigits = digitsOnly(q)
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (qDigits !== '' && (p.phone ?? '').includes(qDigits)) ||
        positions.some((r) => r.roleName.toLowerCase().includes(q) || (r.area ?? '').toLowerCase().includes(q))
      )
    })
  }, [people, rolesById, search, accessFilter, showInactive])

  const activeCount = people.filter(isActive).length
  const unassignedCount = people.filter((p) => isActive(p) && positionsOf(p).length === 0).length

  // HQ logins whose password management does not know — candidates for "password = phone".
  const unknownPasswords = people.filter((p) =>
    isActive(p) && p.uid !== appUser?.uid && ['hq', 'admin'].includes(accessOf(p)) &&
    !passwords[p.uid] && digitsOnly(p.phone).length >= 6 && !!p.email)

  const resetAllUnknown = async () => {
    setBulkBusy(true)
    let done = 0
    const failed: string[] = []
    for (const p of unknownPasswords) {
      try { await ensureLogin(p.uid); done++ } catch { failed.push(p.name) }
    }
    setBulkBusy(false)
    if (failed.length) toast(`עודכנו ${done}; נכשל עבור: ${failed.join(', ')}`, 'error')
    else toast(`הסיסמה של ${done} אנשי מטה נקבעה למספר הטלפון שלהם`, 'success')
  }

  if (loading) return <Spinner size="lg" />
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600 font-medium mb-2">שגיאה בטעינת האנשים</p>
      <p className="text-sm text-gray-500">{error}</p>
    </div>
  )

  const passwordCell = (p: AppUser) => {
    const access = accessOf(p)
    if (access === 'none' || !isActive(p)) return <span className="text-gray-300">—</span>
    if (access === 'coordinator') {
      return showPasswords
        ? <span dir="ltr" className="font-mono">{digitsOnly(p.phone) || '—'}</span>
        : <span className="text-gray-400">מספר הטלפון</span>
    }
    const known = passwords[p.uid]
    if (!known) return <span className="text-gray-400">לא ידועה</span>
    return showPasswords ? <span dir="ltr" className="font-mono">{known}</span> : <span className="text-gray-400">••••••••</span>
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>אנשים ומשתמשים</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            המקום היחיד שבו מזינים אדם, פרטי קשר ותפקיד. העץ הארגוני, רכזי הסניפים והכניסה למערכת נגזרים מכאן.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#189A9F' }}>
          + הוסף אדם
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          aria-label="חיפוש"
          placeholder="חיפוש שם / טלפון / תפקיד…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F] w-56"
        />
        <select
          aria-label="סינון לפי גישה"
          value={accessFilter}
          onChange={(e) => setAccessFilter(e.target.value as AccessFilter)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
        >
          <option value="">כל האנשים</option>
          {(Object.keys(ACCESS_LABELS) as AccessLevel[]).map((a) => <option key={a} value={a}>{ACCESS_LABELS[a]}</option>)}
          <option value="unassigned">ללא תפקיד ({unassignedCount})</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#189A9F]" />
          הצג לא פעילים
        </label>
        {isManager && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#189A9F]" />
            הצג סיסמאות
          </label>
        )}
        <span className="text-xs text-gray-400 mr-auto">{filtered.length} מתוך {activeCount} פעילים</span>
      </div>

      {isManager && unknownPasswords.length > 0 && (
        <div className="text-xs bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-amber-800">
            ל-{unknownPasswords.length} אנשי מטה הסיסמה אינה ידועה ({unknownPasswords.map((p) => p.name).join(', ')}).
          </span>
          <button onClick={() => void resetAllUnknown()} disabled={bulkBusy}
            className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-800 hover:bg-amber-50 disabled:opacity-50">
            {bulkBusy ? 'מעדכן…' : 'קבע לכולם סיסמה = מספר הטלפון'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">שם</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">תפקידים בארגון</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">טלפון</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">אימייל</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">גישה למערכת</th>
              {isManager && <th className="px-4 py-2.5 text-right font-medium text-gray-600">סיסמה</th>}
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isManager ? 7 : 6} className="px-4 py-8 text-center text-gray-400">אין אנשים להצגה</td>
              </tr>
            )}
            {filtered.map((p) => {
              const positions = positionsOf(p)
              const access = accessOf(p)
              return (
                <tr key={p.uid} className={`border-b border-gray-50 ${isActive(p) ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: '#141348' }}>
                    {p.name}
                    {p.uid === appUser?.uid && <span className="text-xs text-gray-400 mr-1">(אני)</span>}
                    {!isActive(p) && <span className="text-xs text-gray-400 mr-1">(לא פעיל/ה)</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {positions.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {positions.map((r) => (
                          <span key={r.id} className="text-xs px-2 py-0.5 rounded font-medium"
                            style={{ backgroundColor: '#C6EFCE', color: '#0A6B2E' }}>
                            {r.roleName}{r.area ? ` · ${r.area}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">ללא תפקיד</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs" dir="ltr">{p.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs" dir="ltr">{p.email || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap" style={ACCESS_STYLE[access]}>
                      {ACCESS_LABELS[access]}
                    </span>
                  </td>
                  {isManager && <td className="px-4 py-2.5 text-xs">{passwordCell(p)}</td>}
                  <td className="px-4 py-2.5 text-left">
                    <button
                      onClick={() => setSelected(p)}
                      aria-label={`ערוך את ${p.name}`}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                    >
                      ערוך
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {adding && <PersonEditModal person={null} org={{ people, roles }} onClose={() => setAdding(false)} />}
      {selected && (
        <PersonEditModal
          person={people.find((p) => p.uid === selected.uid) ?? selected}
          org={{ people, roles }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
