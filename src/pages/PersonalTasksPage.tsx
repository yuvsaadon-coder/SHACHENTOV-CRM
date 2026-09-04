import { useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { usePersonalTasks } from '../hooks/usePersonalTasks'
import { Spinner } from '../components/ui/Spinner'
import {
  DOMAIN_LABELS, DOMAINS, FREQUENCY_LABELS,
  PERSONAL_TASK_STATUSES, PERSONAL_TASK_STATUS_STYLE,
  type PersonalTask, type PersonalTaskStatus, type Domain, type TaskFrequency,
} from '../types'

function effectiveStatus(t: PersonalTask): PersonalTaskStatus {
  if (t.status) return t.status
  return t.done ? 'בוצע' : 'לא בוצע'
}

// ── Promote to org task modal ─────────────────────────────────────────────────

function PromoteModal({ task, uid, onClose }: { task: PersonalTask; uid: string; onClose: () => void }) {
  const [domain, setDomain] = useState<Domain>('CEO')
  const [category, setCategory] = useState('')
  const [frequency, setFrequency] = useState<TaskFrequency>('חד-פעמי')
  const [saving, setSaving] = useState(false)

  const promote = async () => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'tasks'), {
        domain,
        category: category.trim() || 'כללי',
        title: task.title,
        steps: task.notes ?? '',
        frequency,
        startDate: null,
        endDate: null,
        holidayAnchor: null,
        involved: [],
        activator: null,
        contactRefs: [],
        status: 'לא בוצע',
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      })
      // Mark personal task done after promoting
      await updateDoc(doc(db, 'users', uid, 'personalTasks', task.id), {
        status: 'בוצע',
        done: true,
        updatedAt: serverTimestamp(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-brand-navy">העבר למשימה ארגונית</h3>
        <p className="text-sm text-gray-500 truncate">{task.title}</p>

        <div>
          <label className="block text-xs text-gray-500 mb-1">תחום</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as Domain)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">קטגוריה</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="קטגוריה (אופציונלי)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">תדירות</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as TaskFrequency)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            {FREQUENCY_LABELS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => void promote()}
            disabled={saving}
            className="flex-1 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: '#141348' }}
          >
            {saving ? 'מעביר...' : 'העבר'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PersonalTasksPage() {
  const { appUser } = useAuth()
  const { personalTasks, loading, error } = usePersonalTasks(appUser?.uid)

  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [statusFilter, setStatusFilter] = useState<PersonalTaskStatus | 'הכל'>('הכל')
  const [promotingTask, setPromotingTask] = useState<PersonalTask | null>(null)

  const addTask = async () => {
    const t = title.trim()
    if (!t || !appUser?.uid) return
    await addDoc(collection(db, 'users', appUser.uid, 'personalTasks'), {
      title: t,
      notes: '',
      done: false,
      status: 'לא בוצע' as PersonalTaskStatus,
      recurring,
      dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setTitle('')
    setDueDate('')
    setRecurring(false)
  }

  const setStatus = async (t: PersonalTask, status: PersonalTaskStatus) => {
    if (!appUser?.uid) return
    await updateDoc(doc(db, 'users', appUser.uid, 'personalTasks', t.id), {
      status,
      done: status === 'בוצע',
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
      </div>
    )
  }

  const filtered = statusFilter === 'הכל'
    ? personalTasks
    : personalTasks.filter((t) => effectiveStatus(t) === statusFilter)

  const open = filtered.filter((t) => effectiveStatus(t) !== 'בוצע')
  const done = filtered.filter((t) => effectiveStatus(t) === 'בוצע')

  // Counts per status for filter chips
  const statusCounts = PERSONAL_TASK_STATUSES.reduce<Record<PersonalTaskStatus, number>>((acc, s) => {
    acc[s] = personalTasks.filter((t) => effectiveStatus(t) === s).length
    return acc
  }, {} as Record<PersonalTaskStatus, number>)

  return (
    <div className="space-y-4 max-w-2xl" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">משימות אישיות</h1>
        <p className="text-sm text-gray-400 mt-1">
          הסביבה האישית שלך — משימות פרטיות שלא קשורות לגאנט הארגוני. רק אתה רואה אותן.
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

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('הכל')}
          className="px-3 py-1.5 rounded-full text-xs border transition-colors"
          style={statusFilter === 'הכל'
            ? { backgroundColor: '#141348', color: 'white', borderColor: '#141348' }
            : { borderColor: '#E5E7EB', color: '#374151' }}
        >
          הכל ({personalTasks.length})
        </button>
        {PERSONAL_TASK_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-full text-xs border transition-colors"
            style={statusFilter === s
              ? { ...PERSONAL_TASK_STATUS_STYLE[s], borderColor: PERSONAL_TASK_STATUS_STYLE[s].backgroundColor }
              : { borderColor: '#E5E7EB', color: '#374151' }}
          >
            {s} {statusCounts[s] > 0 ? `(${statusCounts[s]})` : ''}
          </button>
        ))}
      </div>

      {/* Open tasks */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
        {open.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">אין משימות להצגה</div>
        )}
        {open.map((t) => {
          const st = effectiveStatus(t)
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-brand-navy">{t.title}</div>
                <div className="flex flex-wrap gap-2 text-xs text-gray-400 mt-0.5">
                  {t.recurring && <span className="bg-gray-100 px-1.5 py-0.5 rounded-full">שוטפת</span>}
                  {t.dueDate && <span>יעד: {t.dueDate.toDate().toLocaleDateString('he-IL')}</span>}
                </div>
              </div>
              {/* Status dropdown */}
              <select
                value={st}
                onChange={(e) => void setStatus(t, e.target.value as PersonalTaskStatus)}
                style={PERSONAL_TASK_STATUS_STYLE[st]}
                className="text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-teal shrink-0"
              >
                {PERSONAL_TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {/* Promote button */}
              <button
                onClick={() => setPromotingTask(t)}
                className="text-xs text-gray-400 hover:text-brand-navy border border-gray-200 rounded px-1.5 py-0.5 shrink-0"
                title="העבר למשימה ארגונית"
              >
                📋
              </button>
              <button
                onClick={() => void removeTask(t.id)}
                className="text-gray-300 hover:text-red-500 text-sm shrink-0"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* Done tasks */}
      {done.length > 0 && (
        <details className="bg-white rounded-xl shadow-sm border border-gray-100">
          <summary className="px-4 py-2.5 text-xs text-gray-500 cursor-pointer hover:bg-gray-50 transition-colors">
            הושלמו ({done.length})
          </summary>
          <div className="divide-y divide-gray-50 border-t border-gray-50">
            {done.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0 text-sm text-gray-400 line-through truncate">{t.title}</div>
                <select
                  value={effectiveStatus(t)}
                  onChange={(e) => void setStatus(t, e.target.value as PersonalTaskStatus)}
                  style={PERSONAL_TASK_STATUS_STYLE['בוצע']}
                  className="text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer focus:outline-none shrink-0"
                >
                  {PERSONAL_TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => void removeTask(t.id)} className="text-gray-300 hover:text-red-500 text-sm shrink-0">✕</button>
              </div>
            ))}
          </div>
        </details>
      )}

      {promotingTask && appUser && (
        <PromoteModal
          task={promotingTask}
          uid={appUser.uid}
          onClose={() => setPromotingTask(null)}
        />
      )}
    </div>
  )
}
