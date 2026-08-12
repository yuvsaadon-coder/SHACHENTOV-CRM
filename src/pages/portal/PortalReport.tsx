import { useState, useMemo, useEffect, useRef } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useQuarterlyReports } from '../../hooks/useQuarterlyReports'
import type { PortalOutletContext } from './CoordinatorPortal'
import { QUARTERS, QUARTER_LABELS, type QuarterLabel } from '../../types'

function currentQuarter(): QuarterLabel {
  const m = new Date().getMonth()
  return (['Q1', 'Q2', 'Q3', 'Q4'] as QuarterLabel[])[Math.floor(m / 3)]
}

type RadioValue = 'כן' | 'לא' | 'דורש רענון'
const RADIO_OPTS: RadioValue[] = ['כן', 'לא', 'דורש רענון']

type SupplierRating = { rating: string; notes: string }

function RatingRow({
  label, fieldKey, value, onChange,
}: {
  label: string
  fieldKey: string
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
      <input type="hidden" name={fieldKey} />
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

const initRating = (): SupplierRating => ({ rating: '', notes: '' })

interface DraftData {
  f1: string; f2: SupplierRating; f3: SupplierRating; f4: SupplierRating
  f5: SupplierRating; f6: SupplierRating; f7: SupplierRating
  f8: string; f9: string; f10: string; f11: string; f12: string; f13: string
  f14: string; f15: string; f16: string; f17: string
  c1: string; c2: string; c3: string; c4: string
  c5: string; c6: string; c7: string; c8: string
  quarter: QuarterLabel; year: number
}

export function PortalReport() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const { appUser } = useAuth()
  const { toast } = useToast()
  const { reports } = useQuarterlyReports(branch.id)

  const DRAFT_KEY = `report_draft_${branch.id}`

  const [quarter, setQuarter] = useState<QuarterLabel>(currentQuarter())
  const [year, setYear] = useState(new Date().getFullYear())
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Food form state
  const [f1, setF1] = useState('')
  const [f2, setF2] = useState<SupplierRating>(initRating())
  const [f3, setF3] = useState<SupplierRating>(initRating())
  const [f4, setF4] = useState<SupplierRating>(initRating())
  const [f5, setF5] = useState<SupplierRating>(initRating())
  const [f6, setF6] = useState<SupplierRating>(initRating())
  const [f7, setF7] = useState<SupplierRating>(initRating())
  const [f8, setF8] = useState('')
  const [f9, setF9] = useState('')
  const [f10, setF10] = useState<RadioValue | ''>('')
  const [f11, setF11] = useState('')
  const [f12, setF12] = useState('')
  const [f13, setF13] = useState('')
  const [f14, setF14] = useState('')
  const [f15, setF15] = useState('')
  const [f16, setF16] = useState('')
  const [f17, setF17] = useState('')

  // Cafe/youth form state
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [c3, setC3] = useState('')
  const [c4, setC4] = useState<RadioValue | ''>('')
  const [c5, setC5] = useState('')
  const [c6, setC6] = useState('')
  const [c7, setC7] = useState('')
  const [c8, setC8] = useState('')

  // Restore draft from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    try {
      const d = JSON.parse(raw) as Partial<DraftData>
      if (d.quarter) setQuarter(d.quarter)
      if (d.year) setYear(d.year)
      if (d.f1 !== undefined) setF1(d.f1)
      if (d.f2) setF2(d.f2)
      if (d.f3) setF3(d.f3)
      if (d.f4) setF4(d.f4)
      if (d.f5) setF5(d.f5)
      if (d.f6) setF6(d.f6)
      if (d.f7) setF7(d.f7)
      if (d.f8 !== undefined) setF8(d.f8)
      if (d.f9 !== undefined) setF9(d.f9)
      if (d.f10) setF10(d.f10 as RadioValue)
      if (d.f11 !== undefined) setF11(d.f11)
      if (d.f12 !== undefined) setF12(d.f12)
      if (d.f13 !== undefined) setF13(d.f13)
      if (d.f14 !== undefined) setF14(d.f14)
      if (d.f15 !== undefined) setF15(d.f15)
      if (d.f16 !== undefined) setF16(d.f16)
      if (d.f17 !== undefined) setF17(d.f17)
      if (d.c1 !== undefined) setC1(d.c1)
      if (d.c2 !== undefined) setC2(d.c2)
      if (d.c3 !== undefined) setC3(d.c3)
      if (d.c4) setC4(d.c4 as RadioValue)
      if (d.c5 !== undefined) setC5(d.c5)
      if (d.c6 !== undefined) setC6(d.c6)
      if (d.c7 !== undefined) setC7(d.c7)
      if (d.c8 !== undefined) setC8(d.c8)
      toast('טיוטה שמורה שוחזרה', 'info')
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave to localStorage with 500ms debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef<DraftData>({
    f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17,
    c1, c2, c3, c4, c5, c6, c7, c8, quarter, year,
  })
  // keep ref current
  draftRef.current = { f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, c1, c2, c3, c4, c5, c6, c7, c8, quarter, year }

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftRef.current))
    }, 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, c1, c2, c3, c4, c5, c6, c7, c8, quarter, year, DRAFT_KEY])

  // beforeunload warning when form has content
  const hasContent = f1 || f8 || f9 || f11 || f14 || c1 || c2 || c5 || c6
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasContent) return
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasContent])

  const existingReport = useMemo(
    () => reports.find((r) => r.quarter === quarter && r.year === year),
    [reports, quarter, year]
  )

  const isFirstReport = reports.length === 0

  const handleSubmit = async () => {
    if (!appUser) return
    setSubmitting(true)
    try {
      const data = branch.type === 'food'
        ? { f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, ...(isFirstReport ? { f16, f17 } : {}) }
        : { c1, c2, c3, c4, c5, c6, c7, ...(isFirstReport ? { c8 } : {}) }

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

      {!existingReport && (
        <>
          {branch.type === 'food' ? (
            <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-5">
              <Section title="סעיף 1 — היקף חלוקה" />
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>כמות סלי מזון ממוצעת בחלוקה</label>
                <input
                  type="number"
                  min={0}
                  value={f1}
                  onChange={(e) => setF1(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                  placeholder="כמות"
                />
              </div>

              <Section title="סעיף 2 — סטטוס ספקים" />
              <RatingRow label="מוצרים יבשים" fieldKey="f2" value={f2} onChange={setF2} />
              <RatingRow label="עופות" fieldKey="f3" value={f3} onChange={setF3} />
              <RatingRow label="ביצים" fieldKey="f4" value={f4} onChange={setF4} />
              <RatingRow label="חלות" fieldKey="f5" value={f5} onChange={setF5} />
              <RatingRow label="ירקות" fieldKey="f6" value={f6} onChange={setF6} />
              <RatingRow label="שקיות / אריזה" fieldKey="f7" value={f7} onChange={setF7} />

              <Section title="סעיף 3 — מלאי, אחסון ותשתיות" />
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>חוסרים במלאי</label>
                <textarea rows={3} value={f8} onChange={(e) => setF8(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>מצב מחסן/מקום האריזה</label>
                <textarea rows={3} value={f9} onChange={(e) => setF9(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
              </div>

              <Section title="סעיף 4 — מתנדבים וצוות" />
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#141348' }}>ביטוח מתנדבים הופץ?</label>
                <div className="flex flex-wrap gap-2">
                  {RADIO_OPTS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setF10(opt)}
                      className="px-3 py-1.5 rounded-lg text-sm border transition-all"
                      style={{
                        backgroundColor: f10 === opt ? '#141348' : 'white',
                        color: f10 === opt ? 'white' : '#141348',
                        borderColor: f10 === opt ? '#141348' : '#E5E7EB',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              {(['מצב מתנדבי אריזה', 'מצב מתנדבי חלוקה/נהגים', 'מתנדבי איסוף מספקים'] as const).map((label, i) => {
                const setters = [setF11, setF12, setF13]
                const values = [f11, f12, f13]
                return (
                  <div key={label}>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>{label}</label>
                    <textarea rows={3} value={values[i]} onChange={(e) => setters[i](e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                  </div>
                )
              })}

              <Section title="סעיף 5 — אווירה וצרכים" />
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>מצב הרוח הכללי</label>
                <textarea rows={3} value={f14} onChange={(e) => setF14(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>במה המטה יכול לעזור?</label>
                <textarea rows={3} value={f15} onChange={(e) => setF15(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
              </div>

              {isFirstReport && (
                <>
                  <Section title="סעיף 6 — הקמה (דיווח ראשון)" />
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>כמות מתנדבי אריזה אידיאלית</label>
                    <input type="text" value={f16} onChange={(e) => setF16(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>כמות מתנדבי חלוקה/נהגים אידיאלית</label>
                    <input type="text" value={f17} onChange={(e) => setF17(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                  </div>
                </>
              )}
            </div>
          ) : (
            /* cafe_youth form */
            <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-5">
              <Section title="סעיף 1 — היקף פעילות" />
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>כמות משתתפים ממוצעת בפעילות</label>
                <input type="number" min={0} value={c1} onChange={(e) => setC1(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                  placeholder="כמות" />
              </div>

              <Section title="סעיף 2 — ציוד ותשתיות" />
              {[
                ['מצב מבנה/ציוד/מקום', c2, setC2] as const,
                ['חוסרים בציוד/מלאי שוטף', c3, setC3] as const,
              ].map(([label, val, setter]) => (
                <div key={label}>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>{label}</label>
                  <textarea rows={3} value={val} onChange={(e) => setter(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                </div>
              ))}

              <Section title="סעיף 3 — מתנדבים" />
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#141348' }}>ביטוח מתנדבים הופץ?</label>
                <div className="flex flex-wrap gap-2">
                  {RADIO_OPTS.map((opt) => (
                    <button key={opt} onClick={() => setC4(opt)}
                      className="px-3 py-1.5 rounded-lg text-sm border transition-all"
                      style={{
                        backgroundColor: c4 === opt ? '#141348' : 'white',
                        color: c4 === opt ? 'white' : '#141348',
                        borderColor: c4 === opt ? '#141348' : '#E5E7EB',
                      }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>מצב מתנדבים כללי</label>
                <textarea rows={3} value={c5} onChange={(e) => setC5(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
              </div>

              <Section title="סעיף 4 — אווירה וצרכים" />
              {[
                ['מצב הרוח הכללי', c6, setC6] as const,
                ['במה המטה יכול לעזור?', c7, setC7] as const,
              ].map(([label, val, setter]) => (
                <div key={label}>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>{label}</label>
                  <textarea rows={3} value={val} onChange={(e) => setter(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                </div>
              ))}

              {isFirstReport && (
                <>
                  <Section title="סעיף 5 — הקמה (דיווח ראשון)" />
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>כמות מתנדבים אידיאלית</label>
                    <input type="text" value={c8} onChange={(e) => setC8(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
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
