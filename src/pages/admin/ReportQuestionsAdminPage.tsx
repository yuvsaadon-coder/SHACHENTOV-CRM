import { useState } from 'react'
import { useReportQuestions, useReportQuestionAdmin } from '../../hooks/useReportQuestions'
import { REPORT_FIELD_TYPES, type ReportFieldType, type ReportQuestion } from '../../types'
import { useToast } from '../../context/ToastContext'

type BranchType = 'food' | 'cafe_youth'
const BRANCH_TYPE_LABELS: Record<BranchType, string> = { food: 'סניפי מזון', cafe_youth: 'בתי קפה ומועדוני נוער' }

interface DraftQuestion {
  key: string
  label: string
  section: string
  type: ReportFieldType
  options: string
  firstReportOnly: boolean
}

const EMPTY_DRAFT: DraftQuestion = { key: '', label: '', section: '', type: 'textarea', options: '', firstReportOnly: false }

function QuestionForm({
  initial, existingKeys, onSave, onCancel, saving,
}: {
  initial: DraftQuestion
  existingKeys: string[]
  onSave: (draft: DraftQuestion) => void
  onCancel: () => void
  saving: boolean
}) {
  const [draft, setDraft] = useState<DraftQuestion>(initial)
  const isNew = !existingKeys.includes(initial.key) || initial.key === ''
  const keyTaken = isNew && draft.key.trim() !== '' && existingKeys.includes(draft.key.trim())
  const canSave = draft.label.trim() && draft.section.trim() && draft.key.trim() && !keyTaken

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2.5 border border-gray-200">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs text-gray-500 mb-1">מזהה שדה (key) *</label>
          <input
            value={draft.key}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value.trim() }))}
            disabled={!isNew}
            placeholder="למשל: f18"
            dir="ltr"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
          />
          {!isNew && <p className="text-xs text-gray-400 mt-0.5">לא ניתן לשנות — משמש לשמירת נתוני דיווחים קיימים</p>}
          {keyTaken && <p className="text-xs text-red-500 mt-0.5">מזהה זה כבר קיים</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">סוג שדה</label>
          <select
            value={draft.type}
            onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as ReportFieldType }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
          >
            {REPORT_FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">כותרת השאלה *</label>
        <input
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">כותרת סעיף (שאלות עם אותה כותרת מקובצות יחד) *</label>
        <input
          value={draft.section}
          onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
        />
      </div>

      {draft.type === 'radio' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">אפשרויות (מופרדות בפסיקים)</label>
          <input
            value={draft.options}
            onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))}
            placeholder="כן, לא, דורש רענון"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={draft.firstReportOnly}
          onChange={(e) => setDraft((d) => ({ ...d, firstReportOnly: e.target.checked }))}
          className="w-4 h-4"
          style={{ accentColor: '#189A9F' }}
        />
        מוצג רק בדיווח הראשון של הסניף
      </label>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(draft)}
          disabled={!canSave || saving}
          className="px-4 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: '#189A9F' }}
        >
          {saving ? 'שומר...' : 'שמור'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600">
          ביטול
        </button>
      </div>
    </div>
  )
}

function BranchTypeSection({ branchType }: { branchType: BranchType }) {
  const { questions, loading, error } = useReportQuestions(branchType)
  const { create, update, remove, reorder } = useReportQuestionAdmin()
  const { toast } = useToast()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const existingKeys = questions.map((q) => q.key)

  const toDraft = (q: ReportQuestion): DraftQuestion => ({
    key: q.key, label: q.label, section: q.section, type: q.type,
    options: (q.options ?? []).join(', '), firstReportOnly: q.firstReportOnly,
  })

  const save = async (id: string | null, draft: DraftQuestion) => {
    setSaving(true)
    try {
      const payload = {
        branchType,
        key: draft.key,
        label: draft.label.trim(),
        section: draft.section.trim(),
        type: draft.type,
        firstReportOnly: draft.firstReportOnly,
        ...(draft.type === 'radio'
          ? { options: draft.options.split(',').map((s) => s.trim()).filter(Boolean) }
          : {}),
      }
      if (id) {
        await update(id, payload)
      } else {
        const maxOrder = Math.max(0, ...questions.map((q) => q.order))
        await create({ ...payload, order: maxOrder + 1 })
      }
      toast('השאלה נשמרה', 'success')
      setEditingId(null)
      setAdding(false)
    } catch {
      toast('שגיאה בשמירת השאלה', 'error')
    } finally {
      setSaving(false)
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= questions.length) return
    const a = questions[index]
    const b = questions[target]
    await Promise.all([reorder(a.id, b.order), reorder(b.id, a.order)])
  }

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    try {
      await remove(id)
      toast('השאלה נמחקה', 'success')
    } catch {
      toast('שגיאה במחיקת השאלה', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h2 className="font-semibold text-sm" style={{ color: '#141348' }}>
          {BRANCH_TYPE_LABELS[branchType]} ({questions.length} שאלות)
        </h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
            style={{ backgroundColor: '#141348', color: 'white', borderColor: '#141348' }}
          >
            + שאלה חדשה
          </button>
        )}
      </div>

      <div className="p-4 space-y-2">
        {loading && <div className="text-center text-sm text-gray-400 py-6">טוען...</div>}
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

        {adding && (
          <QuestionForm
            initial={EMPTY_DRAFT}
            existingKeys={existingKeys}
            saving={saving}
            onCancel={() => setAdding(false)}
            onSave={(draft) => void save(null, draft)}
          />
        )}

        {questions.map((q, i) => (
          <div key={q.id}>
            {editingId === q.id ? (
              <QuestionForm
                initial={toDraft(q)}
                existingKeys={existingKeys}
                saving={saving}
                onCancel={() => setEditingId(null)}
                onSave={(draft) => void save(q.id, draft)}
              />
            ) : (
              <div className="flex items-start gap-2 py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                  <button
                    onClick={() => void move(i, -1)}
                    disabled={i === 0}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                    aria-label="הזז למעלה"
                  >▲</button>
                  <button
                    onClick={() => void move(i, 1)}
                    disabled={i === questions.length - 1}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                    aria-label="הזז למטה"
                  >▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400">{q.section}</div>
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap" style={{ color: '#141348' }}>
                    {q.label}
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      {REPORT_FIELD_TYPES.find((t) => t.id === q.type)?.label}
                    </span>
                    {q.firstReportOnly && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#FDC85733', color: '#7A5A00' }}>
                        דיווח ראשון בלבד
                      </span>
                    )}
                  </div>
                  {q.type === 'radio' && q.options && (
                    <div className="text-xs text-gray-400 mt-0.5">{q.options.join(' / ')}</div>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setEditingId(q.id)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-teal-400">
                    ערוך
                  </button>
                  <button
                    onClick={() => void handleDelete(q.id)}
                    className={`text-xs px-2 py-1 rounded-lg border ${confirmDeleteId === q.id ? 'bg-red-600 text-white border-red-600' : 'border-red-200 text-red-500 hover:bg-red-50'}`}
                  >
                    {confirmDeleteId === q.id ? 'אשר מחיקה' : 'מחק'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {!loading && questions.length === 0 && !adding && (
          <div className="text-center text-sm text-gray-400 py-6">אין שאלות מוגדרות</div>
        )}
      </div>
    </div>
  )
}

export function ReportQuestionsAdminPage() {
  return (
    <div className="max-w-3xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>עריכת שאלות דיווח רבעוני</h1>
        <p className="text-sm text-gray-500 mt-1">
          שינויים כאן חלים מיידית על טופס הדיווח שהרכזים רואים בפורטל. שאלות קיימות בדיווחים שכבר הוגשו לא נמחקות גם אם השאלה מוסרת מהטופס.
        </p>
      </div>
      <BranchTypeSection branchType="food" />
      <BranchTypeSection branchType="cafe_youth" />
    </div>
  )
}
