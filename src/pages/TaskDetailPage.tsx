import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  doc, getDoc, updateDoc, serverTimestamp, setDoc,
  collection, addDoc, onSnapshot, orderBy, query, deleteDoc,
  where, Timestamp
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { StatusBadge } from '../components/ui/StatusBadge'
import { DomainBadge } from '../components/ui/DomainBadge'
import { Spinner } from '../components/ui/Spinner'
import type { Task, Comment, Attachment, HistoryEntry, TaskStatus } from '../types'
import { DOMAIN_LABELS, STATUS_LABELS, FREQUENCY_LABELS } from '../types'

function toDateValue(ts: unknown): string {
  if (!ts) return ''
  if (ts && typeof (ts as { toDate?: unknown }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString().slice(0, 10)
  }
  return ''
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { appUser } = useAuth()
  const { toast } = useToast()

  const [task, setTask] = useState<Task | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Task>>({})
  const [saving, setSaving] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [newComment, setNewComment] = useState('')
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<'details' | 'comments' | 'files' | 'history'>('details')
  const [subTasks, setSubTasks] = useState<Task[]>([])
  const [parentTask, setParentTask] = useState<Task | null>(null)
  const [showNewSub, setShowNewSub] = useState(false)
  const [subForm, setSubForm] = useState<{ title: string; responsible: string; status: TaskStatus }>({
    title: '', responsible: '', status: 'לא בוצע',
  })
  const [savingSub, setSavingSub] = useState(false)

  const isNew = id === 'new'

  useEffect(() => {
    if (isNew) {
      setEditing(true)
      setForm({ domain: 'CEO', status: 'לא בוצע', involved: [], contactRefs: [], steps: '', notes: '' })
      return
    }
    if (!id) return
    getDoc(doc(db, 'tasks', id)).then((snap) => {
      if (snap.exists()) {
        const t = { id: snap.id, ...snap.data() } as Task
        setTask(t)
        setForm(t)
      }
    })
  }, [id, isNew])

  // Load sub-tasks for this task
  useEffect(() => {
    if (!id || isNew) return
    const q = query(collection(db, 'tasks'), where('parentTaskId', '==', id))
    const unsub = onSnapshot(q, (snap) => {
      setSubTasks(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Task))
          .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      )
    })
    return unsub
  }, [id, isNew])

  // Load parent task if this is a sub-task
  useEffect(() => {
    if (!task?.parentTaskId) return
    getDoc(doc(db, 'tasks', task.parentTaskId)).then((snap) => {
      if (snap.exists()) setParentTask({ id: snap.id, ...snap.data() } as Task)
    })
  }, [task?.parentTaskId])

  useEffect(() => {
    if (!id || isNew) return
    const colRef = (sub: string) => query(collection(db, 'tasks', id, sub), orderBy('createdAt', 'desc'))
    const u1 = onSnapshot(colRef('comments'), (s) =>
      setComments(s.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)))
    )
    const u2 = onSnapshot(colRef('attachments'), (s) =>
      setAttachments(s.docs.map((d) => ({ id: d.id, ...d.data() } as Attachment)))
    )
    const u3 = onSnapshot(colRef('history'), (s) =>
      setHistory(s.docs.map((d) => ({ id: d.id, ...d.data() } as HistoryEntry)))
    )
    return () => { u1(); u2(); u3() }
  }, [id, isNew])

  const canEdit = !!appUser || isNew

  const save = async () => {
    if (!form.title) { toast('נא למלא כותרת משימה', 'error'); return }
    setSaving(true)
    try {
      if (isNew) {
        const newId = `TASK-${Date.now()}`
        await setDoc(doc(db, 'tasks', newId), {
          ...form, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          createdBy: appUser?.name, updatedBy: appUser?.name,
        })
        navigate(`/tasks/${newId}`)
        toast('המשימה נוצרה בהצלחה', 'success')
      } else {
        if (task) {
          const changed = Object.entries(form).filter(([k, v]) => {
            const key = k as keyof Task
            return JSON.stringify(task[key]) !== JSON.stringify(v)
          })
          for (const [field, newVal] of changed) {
            await addDoc(collection(db, 'tasks', id!, 'history'), {
              field,
              oldValue: String((task as unknown as Record<string, unknown>)[field] ?? ''),
              newValue: String(newVal ?? ''),
              changedBy: appUser?.name,
              changedAt: serverTimestamp(),
            })
          }
        }
        await updateDoc(doc(db, 'tasks', id!), {
          ...form, updatedAt: serverTimestamp(), updatedBy: appUser?.name,
        })
        setTask({ ...task!, ...form } as Task)
        setEditing(false)
        toast('המשימה עודכנה בהצלחה', 'success')
      }
    } catch {
      toast('שגיאה בשמירת המשימה. נסה שוב.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const addComment = async () => {
    if (!newComment.trim() || !id) return
    try {
      await addDoc(collection(db, 'tasks', id, 'comments'), {
        text: newComment.trim(), author: appUser?.name, createdAt: serverTimestamp(),
      })
      setNewComment('')
    } catch {
      toast('שגיאה בשליחת ההערה', 'error')
    }
  }

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    if (file.size > 20 * 1024 * 1024) {
      toast('הקובץ גדול מדי — מקסימום 20 MB', 'error')
      e.target.value = ''
      return
    }
    setUploading(true)
    try {
      const storageRef = ref(storage, `tasks/${id}/${Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      await addDoc(collection(db, 'tasks', id, 'attachments'), {
        fileName: file.name, storageUrl: url,
        uploadedBy: appUser?.name, uploadedAt: serverTimestamp(),
      })
      toast('הקובץ הועלה בהצלחה', 'success')
    } catch {
      toast('שגיאה בהעלאת הקובץ. נסה שוב.', 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const deleteAttachment = async (att: Attachment) => {
    if (!id) return
    try { await deleteObject(ref(storage, att.storageUrl)) } catch {}
    await deleteDoc(doc(db, 'tasks', id, 'attachments', att.id))
  }

  const saveSubTask = async () => {
    if (!subForm.title.trim() || !id || !task) return
    setSavingSub(true)
    try {
      const newId = `TASK-${Date.now()}`
      await setDoc(doc(db, 'tasks', newId), {
        title: subForm.title.trim(),
        responsible: subForm.responsible.trim(),
        status: subForm.status,
        parentTaskId: id,
        domain: task.domain,
        category: task.category || '',
        frequency: task.frequency || 'חד-פעמי',
        startDate: null,
        endDate: null,
        holidayAnchor: null,
        activator: null,
        involved: [],
        contactRefs: [],
        dependsOn: [],
        steps: '',
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: appUser?.name || '',
        updatedBy: appUser?.name || '',
      })
      setSubForm({ title: '', responsible: '', status: 'לא בוצע' })
      setShowNewSub(false)
    } finally {
      setSavingSub(false)
    }
  }

  if (!isNew && !task) return <Spinner size="lg" />

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/tasks" className="text-brand-teal hover:underline text-sm">← משימות</Link>
        {parentTask && (
          <>
            <span className="text-gray-300">/</span>
            <Link to={`/tasks/${parentTask.id}`} className="text-brand-teal hover:underline text-sm truncate max-w-[200px]">
              {parentTask.title}
            </Link>
          </>
        )}
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-brand-navy flex-1">
          {task?.title || 'משימה חדשה'}
        </h1>
        {task && <DomainBadge domain={task.domain} />}
        {task && <StatusBadge status={task.status} />}
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="bg-brand-teal hover:bg-brand-tealDark text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
          >
            עריכה
          </button>
        )}
      </div>

      {!isNew && (
        <div className="flex gap-1 border-b border-gray-200">
          {(['details', 'comments', 'files', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-brand-teal text-brand-teal'
                  : 'border-transparent text-gray-500 hover:text-brand-navy'
              }`}
            >
              {{ details: 'פרטים', comments: `הערות (${comments.length})`, files: `קבצים (${attachments.length})`, history: 'היסטוריה' }[t]}
            </button>
          ))}
        </div>
      )}

      {(tab === 'details' || isNew) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brand-navy mb-1">כותרת משימה *</label>
                <input
                  value={form.title || ''}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">תחום</label>
                <select
                  value={form.domain || 'CEO'}
                  onChange={(e) => setForm({ ...form, domain: e.target.value as Task['domain'] })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                >
                  {Object.entries(DOMAIN_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">קטגוריה</label>
                <input
                  value={form.category || ''}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">אחראי</label>
                <input
                  value={form.responsible || ''}
                  onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">סטטוס</label>
                <select
                  value={form.status || 'לא בוצע'}
                  onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                >
                  {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">תדירות</label>
                <select
                  value={form.frequency || ''}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value as Task['frequency'] })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                >
                  {FREQUENCY_LABELS.map((fr) => <option key={fr} value={fr}>{fr}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">תאריך התחלה</label>
                <input
                  type="date"
                  value={toDateValue(form.startDate)}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value ? Timestamp.fromDate(new Date(e.target.value)) : null })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">תאריך סיום</label>
                <input
                  type="date"
                  value={toDateValue(form.endDate)}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value ? Timestamp.fromDate(new Date(e.target.value)) : null })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">נקודת ציון שנתית</label>
                <input
                  value={form.holidayAnchor || ''}
                  onChange={(e) => setForm({ ...form, holidayAnchor: e.target.value || null })}
                  placeholder="פסח / ראש השנה / ..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-navy mb-1">מפעיל / את מי להפעיל</label>
                <input
                  value={form.activator || ''}
                  onChange={(e) => setForm({ ...form, activator: e.target.value || null })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brand-navy mb-1">סדר פעולות / פירוט</label>
                <textarea
                  value={form.steps || ''}
                  onChange={(e) => setForm({ ...form, steps: e.target.value })}
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brand-navy mb-1">הערות</label>
                <textarea
                  value={form.notes || ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
                />
              </div>
              <div className="md:col-span-2 flex gap-2 justify-end">
                {!isNew && (
                  <button
                    onClick={() => { setEditing(false); setForm(task!) }}
                    className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    ביטול
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-brand-teal hover:bg-brand-tealDark text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
                  {saving ? 'שומר...' : 'שמור'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="קטגוריה" value={task?.category} />
              <Field label="אחראי" value={task?.responsible} />
              <Field label="מעורבים" value={task?.involved?.join(', ')} />
              <Field label="תדירות" value={task?.frequency} />
              <Field label="תאריך התחלה" value={task?.startDate?.toDate().toLocaleDateString('he-IL')} />
              <Field label="תאריך סיום" value={task?.endDate?.toDate().toLocaleDateString('he-IL')} />
              <Field label="נקודת ציון שנתית" value={task?.holidayAnchor} />
              <Field label="מפעיל" value={task?.activator} />
              {task?.steps && (
                <div className="md:col-span-2">
                  <div className="text-xs text-gray-400 mb-1">סדר פעולות</div>
                  <pre className="text-sm text-brand-navy whitespace-pre-wrap font-sans bg-[#E6F4F4] rounded-lg p-3">{task.steps}</pre>
                </div>
              )}
              {task?.notes && (
                <div className="md:col-span-2">
                  <Field label="הערות" value={task.notes} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sub-tasks — shown on details tab for top-level tasks */}
      {tab === 'details' && !isNew && !task?.parentTaskId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-brand-navy text-sm">תתי-משימות ({subTasks.length})</h2>
            <button
              onClick={() => setShowNewSub((v) => !v)}
              className="text-xs bg-brand-teal text-white px-3 py-1 rounded-lg hover:opacity-90 transition-opacity"
            >
              {showNewSub ? 'ביטול' : '+ הוסף תת-משימה'}
            </button>
          </div>

          {showNewSub && (
            <div className="flex flex-wrap gap-2 mb-3 p-3 bg-gray-50 rounded-lg">
              <input
                value={subForm.title}
                onChange={(e) => setSubForm({ ...subForm, title: e.target.value })}
                placeholder="כותרת תת-משימה *"
                className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              />
              <input
                value={subForm.responsible}
                onChange={(e) => setSubForm({ ...subForm, responsible: e.target.value })}
                placeholder="אחראי"
                className="w-36 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              />
              <select
                value={subForm.status}
                onChange={(e) => setSubForm({ ...subForm, status: e.target.value as TaskStatus })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              >
                {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={saveSubTask}
                disabled={savingSub || !subForm.title.trim()}
                className="bg-brand-teal text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {savingSub ? 'שומר...' : 'שמור'}
              </button>
            </div>
          )}

          <ul className="space-y-2">
            {subTasks.map((st) => (
              <li key={st.id} className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 last:border-0">
                <Link to={`/tasks/${st.id}`} className="text-sm text-brand-navy hover:underline truncate flex-1">
                  {st.title}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {st.responsible && <span className="text-xs text-gray-400">{st.responsible}</span>}
                  <StatusBadge status={st.status} />
                </div>
              </li>
            ))}
            {subTasks.length === 0 && !showNewSub && (
              <li className="text-sm text-gray-400 text-center py-2">אין תתי-משימות</li>
            )}
          </ul>
        </div>
      )}

      {tab === 'comments' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="הוסף הערה..."
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              onKeyDown={(e) => e.key === 'Enter' && addComment()}
            />
            <button
              onClick={addComment}
              className="bg-brand-teal hover:bg-brand-tealDark text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              שלח
            </button>
          </div>
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="bg-[#E6F4F4] rounded-lg p-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span className="font-medium text-brand-navy">{c.author}</span>
                  <span>{c.createdAt?.toDate().toLocaleString('he-IL')}</span>
                </div>
                <p className="text-sm text-brand-navy">{c.text}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="text-sm text-gray-400 text-center py-4">אין הערות עדיין</p>}
          </div>
        </div>
      )}

      {tab === 'files' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="bg-brand-teal hover:bg-brand-tealDark text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {uploading ? 'מעלה...' : '+ צרף קובץ'}
            </span>
            <input type="file" className="hidden" onChange={uploadFile} disabled={uploading} />
          </label>
          <div className="space-y-2">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <a href={a.storageUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-teal hover:underline">
                  {a.fileName}
                </a>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{a.uploadedBy}</span>
                  <button onClick={() => deleteAttachment(a)} className="text-red-400 hover:text-red-600">✕</button>
                </div>
              </div>
            ))}
            {attachments.length === 0 && <p className="text-sm text-gray-400 text-center py-4">אין קבצים מצורפים</p>}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="text-xs border-b border-gray-50 pb-2">
                <span className="font-medium text-brand-navy">{h.changedBy}</span>{' '}
                שינה <span className="font-medium">{h.field}</span>:{' '}
                <span className="line-through text-gray-400">{h.oldValue}</span>{' → '}
                <span className="text-brand-teal">{h.newValue}</span>
                <span className="text-gray-400 mr-2">{h.changedAt?.toDate().toLocaleString('he-IL')}</span>
              </div>
            ))}
            {history.length === 0 && <p className="text-sm text-gray-400 text-center py-4">אין היסטוריית שינויים</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm text-brand-navy">{value}</div>
    </div>
  )
}
