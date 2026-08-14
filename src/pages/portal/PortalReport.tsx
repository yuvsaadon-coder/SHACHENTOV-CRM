import { useState, useMemo, useEffect, useRef } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useQuarterlyReports } from '../../hooks/useQuarterlyReports'
import { useReportQuestions } from '../../hooks/useReportQuestions'
import type { PortalOutletContext } from './CoordinatorPortal'
import { QUARTERS, QUARTER_LABELS, type QuarterLabel, type ReportQuestion } from '../../types'
import { Spinner } from '../../components/ui/Spinner'

function currentQuarter(): QuarterLabel {
  const m = new Date().getMonth()
  return (['Q1', 'Q2', 'Q3', 'Q4'] as QuarterLabel[])[Math.floor(m / 3)]
}

type SupplierRating = { rating: string; notes: string }
const isRatingValue = (v: unknown): v is SupplierRating =>
  typeof v === 'object' && v !== null && ('rating' in v || 'notes' in v)

function RatingRow({
  label, value, onChange,
}: {
  label: string
  value: SupplierRating
  onChange: (v: SupplierRating) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium" style={{ color: '#141348' }}>{label}</div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange({ ...value, rating: String(n) })}
            className="w-8 h-8 rounded-full text-sm font-medium border transition-all"
            style={{
              backgroundColor: value.rating === String(n) ? '#189A9F' : 'white',
              color: value.rating === String(n) ? 'white' : '#141348',
              borderColor: value.rating === String(n) ? '#189A9F' : '#E5E7EB',
            }}
          >
            {n}
          </button>
        ))}
        <span className="text-xs text-gray-400 mr-1">(1 = גרוע, 5 = מצוין)</span>
      </div>
      <textarea
        rows={2}
        placeholder={`הערות על ${label} (אופציונלי)`}
        value={value.notes}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
      />
    </div>
  )
}

function Section({ title }: { title: string }) {
  return (
    <div className="pt-2 pb-1 border-b border-gray-100">
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</h3>
    </div>
  )
}

type FieldValue = string | SupplierRating

function QuestionField({
  question, value, onChange,
}: {
  question: ReportQuestion
  value: FieldValue
  onChange: (v: FieldValue) => void
}) {
  if (question.type === 'rating') {
    const rv = isRatingValue(value) ? value : { rating: '', notes: '' }
    return <RatingRow label={question.label} value={rv} onChange={onChange} />
  }

  const sv = typeof value === 'string' ? value : ''

  if (question.type === 'radio') {
    return (
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: '#141348' }}>{question.label}</label>
        <div className="flex flex-wrap gap-2">
          {(question.options ?? []).map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className="px-3 py-1.5 rounded-lg text-sm border transition-all"
              style={{
                backgroundColor: sv === opt ? '#141348' : 'white',
                color: sv === opt ? 'white' : '#141348',
                borderColor: sv === opt ? '#141348' : '#E5E7EB',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (question.type === 'number') {
    return (
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>{question.label}</label>
        <input
          type="number"
          min={0}
          value={sv}
          onChange={(e) => onChange(e.target.value)}
          placeholder="כמות"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
        />
      </div>
    )
  }

  if (question.type === 'text') {
    return (
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>{question.label}</label>
        <input
          type="text"
          value={sv}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
        />
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>{question.label}</label>
      <textarea
        rows={3}
        value={sv}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
      />
    </div>
  )
}

const defaultFor = (type: ReportQuestion['type']): FieldValue =>
  type === 'rating' ? { rating: '', notes: '' } : ''

const hasContentValue = (v: FieldValue) =>
  isRatingValue(v) ? Boolean(v.rating || v.notes) : Boolean(v)

export function PortalReport() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const { appUser } = useAuth()
  const { toast } = useToast()
  const { reports } = useQuarterlyReports(branch.id)
  const { questions, loading: questionsLoading } = useReportQuestions(branch.type)

  const DRAFT_KEY = `report_draft_${branch.id}`

  const [quarter, setQuarter] = useState<QuarterLabel>(currentQuarter())
  const [year, setYear] = useState(new Date().getFullYear())
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const restoredRef = useRef(false)

  const existingReport = useMemo(
    () => reports.find((r) => r.quarter === quarter && r.year === year),
    [reports, quarter, year]
  )
  const isFirstReport = reports.length === 0

  // Initialize any question not yet in state (covers newly-added questions too).
  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev }
      let changed = false
      for (const q of questions) {
        if (!(q.key in next)) { next[q.key] = defaultFor(q.type); changed = true }
      }
      return changed ? next : prev
    })
  }, [questions])

  // Restore draft from localStorage once questions are known.
  useEffect(() => {
    if (restoredRef.current || questionsLoading) return
    restoredRef.current = true
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    try {
      const d = JSON.parse(raw) as { quarter?: QuarterLabel; year?: number; values?: Record<string, FieldValue> }
      if (d.quarter) setQuarter(d.quarter)
      if (d.year) setYear(d.year)
      if (d.values) setValues((prev) => ({ ...prev, ...d.values }))
      toast('טיוטה שמורה שוחזרה', 'info')
    } catch { /* ignore malformed draft */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsLoading])

  // Autosave to localStorage with 500ms debounce.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ quarter, year, values }))
    }, 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [values, quarter, year, DRAFT_KEY])

  const hasContent = Object.values(values).some(hasContentValue)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasContent) return
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasContent])

  const setField = (key: string, v: FieldValue) => setValues((prev) => ({ ...prev, [key]: v }))

  const handleSubmit = async () => {
    if (!appUser) return
    setSubmitting(true)
    try {
      const visible = questions.filter((q) => isFirstReport || !q.firstReportOnly)
      const data: Record<string, FieldValue> = {}
      for (const q of visible) data[q.key] = values[q.key] ?? defaultFor(q.type)

      await addDoc(collection(db, 'quarterlyReports'), {
        branchId: branch.id,
        branchType: branch.type,
        quarter,
        year,
        submittedAt: serverTimestamp(),
        submittedBy: appUser.uid,
        isFirstReport,
        data,
      })
      localStorage.removeItem(DRAFT_KEY)
      setSubmitted(true)
      toast('הדיווח נשלח בהצלחה!', 'success')
    } catch {
      toast('שגיאה בשליחת הדיווח. נסה שוב.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const years = [new Date().getFullYear(), new Date().getFullYear() - 1]

  if (submitted) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] text-center" dir="rtl">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold mb-2" style={{ color: '#141348' }}>תודה! הדיווח נשלח בהצלחה</h2>
        <p className="text-sm text-gray-500 mb-6">{QUARTER_LABELS[quarter]} {year}</p>
        <Link to="/portal/home" className="px-6 py-3 rounded-xl text-white text-sm font-medium" style={{ backgroundColor: '#141348' }}>
          חזרה לדף הבית
        </Link>
      </div>
    )
  }

  // Group questions by section, in the order sections first appear.
  const sections: { title: string; questions: ReportQuestion[] }[] = []
  for (const q of questions) {
    if (q.firstReportOnly && !isFirstReport) continue
    let group = sections.find((s) => s.title === q.section)
    if (!group) { group = { title: q.section, questions: [] }; sections.push(group) }
    group.questions.push(q)
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto" dir="rtl">
      <h1 className="text-xl font-bold" style={{ color: '#141348' }}>דיווח רבעוני</h1>

      {/* Quarter + year selector */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">רבעון</label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value as QuarterLabel)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            >
              {QUARTERS.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">שנה</label>
            <select
              value={year}
              onChange={(e) => setYear(+e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {existingReport && (
          <div className="bg-[#E6F4F4] border border-[#189A9F]/30 rounded-lg px-3 py-2 text-sm text-[#0A6B2E]">
            ✓ כבר הגשת דיווח לתקופה זו ({existingReport.submittedAt?.toDate?.().toLocaleDateString('he-IL')})
          </div>
        )}
      </div>

      {questionsLoading && <Spinner />}

      {!questionsLoading && !existingReport && (
        <>
          {questions.length === 0 ? (
            <div className="bg-white rounded-xl p-4 border border-gray-100 text-center text-sm text-gray-400">
              טופס הדיווח לא הוגדר עדיין עבור סוג סניף זה. פנה למטה.
            </div>
          ) : (
            <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-5">
              {sections.map((section) => (
                <div key={section.title} className="space-y-5">
                  <Section title={section.title} />
                  {section.questions.map((q) => (
                    <QuestionField
                      key={q.key}
                      question={q}
                      value={values[q.key] ?? defaultFor(q.type)}
                      onChange={(v) => setField(q.key, v)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || questions.length === 0}
            className="w-full py-3 rounded-xl text-white font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#141348' }}
          >
            {submitting ? 'שולח...' : 'שלח דיווח'}
          </button>
        </>
      )}
    </div>
  )
}
