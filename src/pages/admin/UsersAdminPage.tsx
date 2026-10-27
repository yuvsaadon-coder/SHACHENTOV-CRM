import { useState, useEffect } from 'react'
import {
  collection, onSnapshot, doc, setDoc, updateDoc, getDocs, query as fsQuery, where,
  serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import {
  sendPasswordResetEmail,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from 'firebase/auth'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import { db, auth, firebaseConfig } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import { useRoles } from '../../hooks/useRoles'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../context/ToastContext'
import type { AppUser, OrgRole, Role } from '../../types'
import { DOMAINS, DOMAIN_LABELS } from '../../types'

type UserType = 'admin' | 'coordinator' | 'hq'

const BRANCH_LEVELS = ['סניף חוץ', 'סניף ירושלים', 'בתי קפה נודדים', 'טוסטר', 'סניפים עיתיים', 'יריד']

function deriveRoleFromOrgRole(orgRole: OrgRole): Role {
  if (BRANCH_LEVELS.includes(orgRole.level)) return 'coordinator'
  const combined = `${orgRole.roleName} ${orgRole.area}`.toLowerCase()
  for (const domain of DOMAINS) {
    if (combined.includes(DOMAIN_LABELS[domain].toLowerCase())) return domain
  }
  return 'CEO'
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'אדמין',
  coordinator: 'רכז/ת',
  ...Object.fromEntries(DOMAINS.map(d => [d, DOMAIN_LABELS[d]])) as Record<typeof DOMAINS[number], string>,
}

async function createFirebaseUser(email: string, password: string): Promise<string> {
  const appName = `user-create-${Date.now()}`
  const tempApp = initializeApp(firebaseConfig, appName)
  try {
    const tempAuth = getAuth(tempApp)
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password)
    return cred.user.uid
  } finally {
    await deleteApp(tempApp)
  }
}

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({ roles, onClose }: { roles: OrgRole[]; onClose: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userType, setUserType] = useState<UserType>('hq')
  const [linkedRoleId, setLinkedRoleId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const selectedOrgRole = roles.find(r => r.id === linkedRoleId)

  const handleOrgRoleChange = (id: string) => {
    setLinkedRoleId(id)
    const r = roles.find(or => or.id === id)
    if (r?.phone && !password) setPassword(r.phone.replace(/\D/g, '').slice(0, 20))
  }

  const derivedRole = (): Role => {
    if (userType === 'admin') return 'admin'
    if (userType === 'coordinator') return 'coordinator'
    return selectedOrgRole ? deriveRoleFromOrgRole(selectedOrgRole) : 'CEO'
  }

  const handleSave = async () => {
    if (!name.trim() || !email.trim() || !password) { setError('שם, אימייל וסיסמא הם שדות חובה'); return }
    if (password.length < 6) { setError('סיסמא חייבת להכיל לפחות 6 תווים'); return }
    if (userType === 'hq' && !linkedRoleId) { setError('יש לקשר את המשתמש לתפקיד בעץ הארגוני'); return }
    setSaving(true)
    setError('')
    try {
      const role = derivedRole()
      const uid = await createFirebaseUser(email.trim(), password)
      const userDoc: Omit<AppUser, 'uid'> & { createdAt: unknown } = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        active: true,
        storedPassword: password,
        createdAt: serverTimestamp(),
        ...(branchId ? { branchId } : {}),
      }
      await setDoc(doc(db, 'users', uid), userDoc)
      if (linkedRoleId) {
        await updateDoc(doc(db, 'roles', linkedRoleId), { uid, holderName: name.trim() })
      }
      toast('המשתמש נוצר בהצלחה', 'success')
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('email-already-in-use')) {
        setError('כתובת האימייל כבר קיימת במערכת')
      } else {
        setError('שגיאה ביצירת משתמש — ' + msg)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold" style={{ color: '#141348' }}>הוסף משתמש</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">שם מלא *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">אימייל *</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 flex items-center justify-between">
              <span>סיסמא ראשונית *</span>
              {selectedOrgRole?.phone && (
                <button type="button" onClick={() => setPassword(selectedOrgRole.phone.replace(/\D/g, '').slice(0, 20))}
                  className="text-[#189A9F] hover:underline">
                  מלא מס' טלפון ({selectedOrgRole.phone})
                </button>
              )}
            </label>
            <div className="relative">
              <input value={password} onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'} dir="ltr"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F] pl-10" />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                {showPassword ? 'הסתר' : 'הצג'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">סוג משתמש *</label>
            <div className="flex gap-2">
              {([['hq', 'צוות מטה'], ['coordinator', 'רכז/ת סניף'], ['admin', 'אדמין']] as [UserType, string][]).map(([val, label]) => (
                <button key={val} type="button"
                  onClick={() => setUserType(val)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${userType === val ? 'border-[#189A9F] bg-[#E6F4F4] text-[#147F84]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {userType === 'coordinator' ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">מזהה סניף (branchId)</label>
              <input value={branchId} onChange={(e) => setBranchId(e.target.value)} dir="ltr"
                placeholder="הכנס את ה-ID של הסניף"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
            </div>
          ) : userType === 'hq' ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                תפקיד בעץ הארגוני *
              </label>
              <select value={linkedRoleId} onChange={(e) => handleOrgRoleChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]">
                <option value="">— בחר תפקיד —</option>
                {roles.filter(r => r.level === 'מטה' || r.level === 'ועד מנהל').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roleName} ({r.area || r.level})
                  </option>
                ))}
                {roles.filter(r => r.level !== 'מטה' && r.level !== 'ועד מנהל').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roleName} — {r.level}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {error && <div className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={() => void handleSave()} disabled={saving}
            className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: '#141348' }}>
            {saving ? 'יוצר...' : 'צור משתמש'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50">ביטול</button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({
  user, roles, isSelf, isAdmin: isAdminProp, onClose,
}: { user: AppUser; roles: OrgRole[]; isSelf: boolean; isAdmin: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState(user.name)
  const [isAdminUser, setIsAdminUser] = useState(user.role === 'admin')
  const [active, setActive] = useState(user.active)
  const linkedRole = roles.find((r) => r.uid === user.uid)
  const [linkedRoleId, setLinkedRoleId] = useState(linkedRole?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const [error, setError] = useState('')
  const [showStoredPwd, setShowStoredPwd] = useState(false)

  // self password-change fields
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  const selectedOrgRole = roles.find(r => r.id === linkedRoleId)

  const computedRole = (): Role => {
    if (isAdminUser) return 'admin'
    if (selectedOrgRole) return deriveRoleFromOrgRole(selectedOrgRole)
    return user.role
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('שם הוא שדה חובה'); return }
    setSaving(true)
    setError('')
    try {
      const role = computedRole()
      const updateData: Record<string, unknown> = { name: name.trim(), updatedAt: serverTimestamp() }
      if (isAdminProp) { updateData.role = role; updateData.active = active }
      await updateDoc(doc(db, 'users', user.uid), updateData)
      // update name in all linked roles
      if (linkedRoleId) {
        if (linkedRole && linkedRole.id !== linkedRoleId) {
          await updateDoc(doc(db, 'roles', linkedRole.id), { uid: null })
        }
        if (linkedRoleId !== linkedRole?.id) {
          await updateDoc(doc(db, 'roles', linkedRoleId), { uid: user.uid, holderName: name.trim() })
        } else if (name.trim() !== user.name) {
          await updateDoc(doc(db, 'roles', linkedRoleId), { holderName: name.trim() })
        }
      } else if (linkedRole && name.trim() !== user.name) {
        await updateDoc(doc(db, 'roles', linkedRole.id), { holderName: name.trim() })
      }
      if (name.trim() !== user.name) {
        const snap = await getDocs(fsQuery(collection(db, 'roles'), where('uid', '==', user.uid)))
        for (const d of snap.docs) {
          if (d.id !== linkedRoleId) await updateDoc(doc(db, 'roles', d.id), { holderName: name.trim() })
        }
      }
      toast('פרטי המשתמש עודכנו', 'success')
      onClose()
    } catch (e) {
      setError('שגיאה בעדכון — ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPwd) { setError('יש להזין את הסיסמא הנוכחית'); return }
    if (!newPwd || newPwd.length < 6) { setError('סיסמא חדשה חייבת להכיל לפחות 6 תווים'); return }
    if (newPwd !== confirmPwd) { setError('הסיסמאות אינן תואמות'); return }
    const fbUser = auth.currentUser
    if (!fbUser || !fbUser.email) return
    setSavingPwd(true)
    setError('')
    try {
      const cred = EmailAuthProvider.credential(fbUser.email, currentPwd)
      await reauthenticateWithCredential(fbUser, cred)
      await updatePassword(fbUser, newPwd)
      await updateDoc(doc(db, 'users', user.uid), { storedPassword: newPwd })
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      toast('הסיסמא עודכנה בהצלחה', 'success')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('הסיסמא הנוכחית שגויה')
      } else {
        setError('שגיאה בעדכון סיסמא — ' + msg)
      }
    } finally {
      setSavingPwd(false)
    }
  }

  const handlePasswordReset = async () => {
    setSendingReset(true)
    try {
      await sendPasswordResetEmail(auth, user.email)
      toast('נשלח מייל לאיפוס סיסמא', 'success')
    } catch {
      setError('שגיאה בשליחת מייל איפוס')
    } finally {
      setSendingReset(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold" style={{ color: '#141348' }}>עריכת משתמש</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-gray-400 font-mono" dir="ltr">{user.email}</div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">שם מלא *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>

          {isAdminProp && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">תפקיד בעץ הארגוני</label>
                <select value={linkedRoleId} onChange={(e) => setLinkedRoleId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]">
                  <option value="">— בחר תפקיד —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roleName} — {r.level}{r.uid && r.uid !== user.uid ? ' (תפוס)' : r.uid === user.uid ? ' ✓ מקושר' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="admin-check" checked={isAdminUser} onChange={(e) => setIsAdminUser(e.target.checked)}
                    className="h-4 w-4 accent-[#189A9F]" />
                  <label htmlFor="admin-check" className="text-sm">אדמין</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active-check" checked={active} onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 accent-[#189A9F]" />
                  <label htmlFor="active-check" className="text-sm">משתמש פעיל</label>
                </div>
              </div>
            </>
          )}

          {/* Password section */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="text-xs font-semibold text-gray-600">סיסמא</div>

            {/* Admin sees stored password of other users */}
            {isAdminProp && !isSelf && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">סיסמא שמורה</span>
                  <button type="button" onClick={() => setShowStoredPwd(p => !p)}
                    className="text-xs text-[#189A9F] hover:underline">
                    {showStoredPwd ? 'הסתר' : 'הצג'}
                  </button>
                </div>
                {showStoredPwd ? (
                  <div className="font-mono text-sm text-gray-800 select-all" dir="ltr">
                    {user.storedPassword || <span className="text-gray-400 italic">לא שמורה</span>}
                  </div>
                ) : (
                  <div className="font-mono text-sm text-gray-400">••••••••</div>
                )}
              </div>
            )}

            {isSelf ? (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">סיסמא נוכחית</label>
                  <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} dir="ltr"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">סיסמא חדשה</label>
                  <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} dir="ltr"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">אישור סיסמא חדשה</label>
                  <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} dir="ltr"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                </div>
                <button onClick={() => void handleChangePassword()} disabled={savingPwd || !currentPwd || !newPwd || !confirmPwd}
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
                  style={{ backgroundColor: '#189A9F' }}>
                  {savingPwd ? 'מעדכן...' : 'עדכן סיסמא'}
                </button>
              </>
            ) : (
              <div className="space-y-1.5">
                <button onClick={() => void handlePasswordReset()} disabled={sendingReset}
                  className="text-sm border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-40">
                  {sendingReset ? 'שולח...' : 'שלח מייל לאיפוס סיסמא'}
                </button>
                <p className="text-xs text-gray-400">יישלח מייל לאיפוס סיסמא לכתובת {user.email}</p>
              </div>
            )}
          </div>

          {error && <div className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={() => void handleSave()} disabled={saving}
            className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50">ביטול</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function UsersAdminPage() {
  const { appUser } = useAuth()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AppUser | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const { roles } = useRoles()

  const isAdmin = appUser?.role === 'admin' || appUser?.role === 'CEO'

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('name'))
    return onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)))
      setLoading(false)
    }, () => setLoading(false))
  }, [])

  if (loading) return <Spinner size="lg" />

  const linkedRoleByUid = Object.fromEntries(roles.filter((r) => r.uid).map((r) => [r.uid!, r]))

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>ניהול משתמשים</h1>
          <p className="text-sm text-gray-500 mt-0.5">כל משתמש חייב להיות מקושר לתפקיד בעץ הארגוני</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#189A9F' }}>
          + הוסף משתמש
        </button>
      </div>

      {!isAdmin && (
        <div className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2">
          כאיש מטה ניתן להוסיף משתמשים חדשים. לעריכת פרטי משתמשים אחרים יש לפנות לאדמין.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">שם</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">אימייל</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">תפקיד בארגון</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">סטטוס</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">אין משתמשים</td>
              </tr>
            )}
            {users.map((u) => {
              const orgRole = linkedRoleByUid[u.uid]
              const isLinked = !!orgRole || u.role === 'coordinator'
              const canEdit = isAdmin || u.uid === appUser?.uid
              const isSelfRow = u.uid === appUser?.uid
              return (
                <tr key={u.uid} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 font-medium" style={{ color: '#141348' }}>
                    {u.name}
                    {isSelfRow && <span className="text-xs text-gray-400 mr-1">(אתה)</span>}
                    {u.role === 'admin' && <span className="text-xs bg-[#141348] text-white px-1.5 py-0.5 rounded mr-1">אדמין</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono text-xs" dir="ltr">{u.email}</td>
                  <td className="px-4 py-2.5">
                    {isLinked ? (
                      <span className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ backgroundColor: '#C6EFCE', color: '#0A6B2E' }}>
                        {orgRole ? orgRole.roleName : (u.role === 'coordinator' ? 'רכז/ת' : ROLE_LABEL[u.role] ?? u.role)}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ backgroundColor: '#FEE2E2', color: '#B91C1C' }}>
                        לא מקושר
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded font-medium"
                      style={u.active
                        ? { backgroundColor: '#E6F4F4', color: '#147F84' }
                        : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }>
                      {u.active ? 'פעיל' : 'לא פעיל'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-left">
                    {canEdit && (
                      <button
                        onClick={() => setSelected(u)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
                      >
                        ערוך
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showAdd && <AddUserModal roles={roles} onClose={() => setShowAdd(false)} />}
      {selected && (
        <EditUserModal
          user={selected}
          roles={roles}
          isSelf={selected.uid === appUser?.uid}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
