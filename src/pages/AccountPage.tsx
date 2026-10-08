import { useState } from 'react'
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth'
import { doc, updateDoc, query, collection, where, getDocs, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export function AccountPage() {
  const { appUser, firebaseUser } = useAuth()
  const { toast } = useToast()

  const [name, setName] = useState(appUser?.name ?? '')
  const [savingName, setSavingName] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  const [nameError, setNameError] = useState('')
  const [pwdError, setPwdError] = useState('')

  const handleSaveName = async () => {
    if (!name.trim()) { setNameError('שם הוא שדה חובה'); return }
    if (!appUser || !firebaseUser) return
    setSavingName(true)
    setNameError('')
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        name: name.trim(),
        updatedAt: serverTimestamp(),
      })
      // update linked org role holderName
      const snap = await getDocs(
        query(collection(db, 'roles'), where('uid', '==', firebaseUser.uid))
      )
      for (const d of snap.docs) {
        await updateDoc(doc(db, 'roles', d.id), { holderName: name.trim() })
      }
      toast('השם עודכן בהצלחה', 'success')
    } catch {
      setNameError('שגיאה בשמירת השם')
    } finally {
      setSavingName(false)
    }
  }

  const handleChangePassword = async () => {
    if (!newPassword) { setPwdError('יש להזין סיסמא חדשה'); return }
    if (newPassword.length < 6) { setPwdError('סיסמא חייבת להכיל לפחות 6 תווים'); return }
    if (newPassword !== confirmPassword) { setPwdError('הסיסמאות אינן תואמות'); return }
    if (!currentPassword) { setPwdError('יש להזין את הסיסמא הנוכחית'); return }
    if (!firebaseUser || !firebaseUser.email) return
    setSavingPwd(true)
    setPwdError('')
    try {
      const cred = EmailAuthProvider.credential(firebaseUser.email, currentPassword)
      await reauthenticateWithCredential(firebaseUser, cred)
      await updatePassword(firebaseUser, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast('הסיסמא עודכנה בהצלחה', 'success')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setPwdError('הסיסמא הנוכחית שגויה')
      } else {
        setPwdError('שגיאה בעדכון הסיסמא — ' + msg)
      }
    } finally {
      setSavingPwd(false)
    }
  }

  if (!appUser) return null

  return (
    <div className="max-w-lg space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>הגדרות חשבון</h1>
        <p className="text-sm text-gray-500 mt-0.5">{appUser.email}</p>
      </div>

      {/* Name */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-sm" style={{ color: '#141348' }}>שם מלא</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
        />
        {nameError && <div className="text-xs text-red-500">{nameError}</div>}
        <button
          onClick={() => void handleSaveName()}
          disabled={savingName || name.trim() === appUser.name}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
          style={{ backgroundColor: '#189A9F' }}
        >
          {savingName ? 'שומר...' : 'עדכן שם'}
        </button>
        <p className="text-xs text-gray-400">השינוי יתעדכן גם בעץ הארגוני</p>
      </div>

      {/* Password */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-sm" style={{ color: '#141348' }}>שינוי סיסמא</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">סיסמא נוכחית</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            dir="ltr"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">סיסמא חדשה</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            dir="ltr"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">אישור סיסמא חדשה</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            dir="ltr"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
          />
        </div>
        {pwdError && <div className="text-xs text-red-500">{pwdError}</div>}
        <button
          onClick={() => void handleChangePassword()}
          disabled={savingPwd || !currentPassword || !newPassword || !confirmPassword}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
          style={{ backgroundColor: '#141348' }}
        >
          {savingPwd ? 'מעדכן...' : 'עדכן סיסמא'}
        </button>
      </div>
    </div>
  )
}
