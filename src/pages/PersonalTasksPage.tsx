import { useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { usePersonalTasks } from '../hooks/usePersonalTasks'
import { Spinner } from '../components/ui/Spinner'
import type { PersonalTask } from '../types'

export function PersonalTasksPage() {
  const { appUser } = useAuth()
  const { personalTasks, loading, error } = usePersonalTasks(appUser?.uid)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const addTask = async () => {
    const t = title.trim()
    if (!t || !appUser?.uid) return
    await addDoc(collection(db, 'users', appUser.uid, 'personalTasks'), {
      title: t,
      notes: '',
      done: false,
      recurring,
      dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setTitle('')
    setDueDate('')
    setRecurring(false)
  }

  const toggleDone = async (t: PersonalTask) => {
    if (!appUser?.uid) return
    await updateDoc(doc(db, 'users', appUser.uid, 'personalTasks', t.id), {
      done: !t.done,
      updatedAt: serverTimestamp(),
    })
  }

  const removeTask = async (id: string) => {
    if (!appUser?.uid) return
    await deleteDoc(doc(db, 'users', appUser.uid, 'personalTasks', id))
  }

  if (loading) return <Spinner size="lg" />

  if (error) {
    return (
      <div className="max-w-2xl bg-red-50 border border-red-100 text-red-700 rounded-xl p-4 text-sm">
        <div className="font-medium mb-1">לא ניתן לטעון את המשימות האישיות</div>
        <div className="text-red-500 text-xs">{error}</div>
        <div className="text-red-500 text-xs mt-2">
          ייתכן שכללי ה-Firestore המעודכנים (הרשאה ל-personalTasks) עדיין לא פורסמו ב-Firebase Console.
        </div>
      </div>
    )
  }

  const open = personalTasks.filter((t) => !t.done)
  const done = personalTasks.filter((t) => t.done)

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">משימות אישיות</h1>
        <p className="text-sm text-gray-400 mt-1">
          הסביבה האישית שלך — משימות פרטיות שלא קשורות לתחום, לאחראי אחר או לגאנט הארגוני. רק אתה רואה אותן.
        </p>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="משימה חדשה..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addTask() }}
            className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-600 px-1">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            שוטפת
          </label>
          <button
            onClick={() => void addTask()}
            disabled={!title.trim()}
            className="bg-brand-teal hover:bg-brand-tealDark text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            + הוסף
          </button>
        </div>
      </div>

      {/* Open tasks */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
        {open.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">אין משימות פתוחות</div>
        )}
        {open.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <input type="checkbox" checked={false} onChange={() => void toggleDone(t)} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-brand-navy truncate">{t.title}</div>
              <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
                {t.recurring && <span className="bg-gray-100 px-1.5 py-0.5 rounded-full">שוטפת</span>}
                {t.dueDate && <span>יעד: {t.dueDate.toDate().toLocaleDateString('he-IL')}</span>}
              </div>
            </div>
            <button
              onClick={() => void removeTask(t.id)}
              className="text-gray-300 hover:text-red-500 text-sm shrink-0"
              aria-label="מחק"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Done tasks */}
      {done.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <button
            onClick={() => setShowDone((v) => !v)}
            className="w-full text-right px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            {showDone ? '▲' : '▼'} הושלמו ({done.length})
          </button>
          {showDone && (
            <div className="divide-y divide-gray-50 border-t border-gray-50">
              {done.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input type="checkbox" checked={true} onChange={() => void toggleDone(t)} className="shrink-0" />
                  <div className="flex-1 min-w-0 text-sm text-gray-400 line-through truncate">{t.title}</div>
                  <button
                    onClick={() => void removeTask(t.id)}
                    className="text-gray-300 hover:text-red-500 text-sm shrink-0"
                    aria-label="מחק"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
