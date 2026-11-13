import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAllBranches } from '../hooks/useBranch'
import { useRoles } from '../hooks/useRoles'
import { saveRole, type OrgData } from '../lib/people'
import { coordinatorsOfBranch } from '../lib/peopleLogic'
import { RoleEditModal } from '../components/roles/RoleEditModal'
import { useQuarterlyReports } from '../hooks/useQuarterlyReports'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import type { Branch, QuarterlyReport, RoleHolder, RoleLevel } from '../types'
import { DIST_FREQ_OPTIONS, QUARTER_LABELS } from '../types'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'משתנה']

const TYPE_LABELS: Record<Branch['type'], string> = {
  food: 'סלי מזון',
  cafe_youth: 'בית קפה / נוער',
}
const TYPE_COLOR: Record<Branch['type'], string> = {
  food: '#189A9F',
  cafe_youth: '#FDC857',
}

type BranchLevel = 'סניף ירושלים' | 'סניף חוץ' | 'בתי קפה נודדים' | 'מועדוני נוער'

function inferLevel(branch: Branch): BranchLevel {
  // Both share the cafe_youth type, so the name is what separates them.
  if (branch.type === 'cafe_youth') {
    return branch.name.includes('מועדון נוער') ? 'מועדוני נוער' : 'בתי קפה נודדים'
  }
  if (branch.city === 'ירושלים' || branch.city.startsWith('ירושלים')) return 'סניף ירושלים'
  return 'סניף חוץ'
}

const LEVEL_COLORS: Record<BranchLevel, { bg: string; text: string }> = {
  'סניף ירושלים':    { bg: '#189A9F22', text: '#189A9F' },
  'סניף חוץ':        { bg: '#141348', text: 'white' },
  'בתי קפה נודדים':  { bg: '#FDC85722', text: '#7A5A00' },
  'מועדוני נוער':    { bg: '#E4DFEC', text: '#5F497A' },
}

const FOOD_LABELS: Record<string, string> = {
  f1: 'כמות סלי מזון ממוצעת', f2: 'מוצרים יבשים', f3: 'עופות',
  f4: 'ביצים', f5: 'חלות', f6: 'ירקות', f7: 'שקיות / אריזה',
  f8: 'חוסרים במלאי', f9: 'מצב מחסן', f10: 'ביטוח מתנדבים הופץ?',
  f11: 'מתנדבי אריזה', f12: 'מתנדבי חלוקה/נהגים', f13: 'מתנדבי איסוף',
  f14: 'מצב הרוח הכללי', f15: 'במה המטה יכול לעזור?',
  f16: 'כמות אריזה אידיאלית', f17: 'כמות חלוקה אידיאלית',
}
const CAFE_LABELS: Record<string, string> = {
  c1: 'כמות משתתפים ממוצעת', c2: 'מצב מבנה/ציוד', c3: 'חוסרים בציוד/מלאי',
  c4: 'ביטוח מתנדבים הופץ?', c5: 'מצב מתנדבים כללי',
  c6: 'מצב הרוח הכללי', c7: 'במה המטה יכול לעזור?', c8: 'כמות מתנדבים אידיאלית',
}

function formatReportValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object' && v !== null) {
    if ('rating' in (v as Record<string, unknown>)) {
      const sr = v as { rating?: string; notes?: string }
      const stars = sr.rating ? `⭐ ${sr.rating}/5` : '—'
      return sr.notes ? `${stars}  |  ${sr.notes}` : stars
    }
    return String(v)
  }
  return String(v)
}

function ReportAccordion({ report }: { report: QuarterlyReport }) {
  const [open, setOpen] = useState(false)
  const labelMap = report.branchType === 'food' ? FOOD_LABELS : CAFE_LABELS
  const entries = Object.entries(report.data).filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 text-right"
      >
        <div>
          <span className="text-sm font-medium" style={{ color: '#141348' }}>
            {QUARTER_LABELS[report.quarter]} {report.year}
          </span>
          <span className="text-xs text-gray-400 mr-2">
            {report.submittedAt?.toDate?.().toLocaleDateString('he-IL')}
          </span>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs space-y-1.5">
          {entries.length === 0 ? (
            <span className="text-gray-400">אין נתונים</span>
          ) : entries.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-gray-500 min-w-[130px] shrink-0">{labelMap[k] ?? k}:</span>
              <span className="text-gray-700">{formatReportValue(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BranchReportsModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const { firebaseUser } = useAuth()
  const { reports, loading } = useQuarterlyReports(branch.id)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  const runAiAnalysis = async () => {
    if (reports.length === 0) return
    setAnalyzing(true)
    setAiAnalysis('')
    try {
      const token = await firebaseUser?.getIdToken()
      const reportsText = reports.map((r) => {
        const labelMap = r.branchType === 'food' ? FOOD_LABELS : CAFE_LABELS
        const entries = Object.entries(r.data)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `  ${labelMap[k] ?? k}: ${formatReportValue(v)}`)
          .join('\n')
        return `${QUARTER_LABELS[r.quarter]} ${r.year}:\n${entries}`
      }).join('\n\n---\n\n')

      const question = `להלן דיווחי רבעון של הסניף "${branch.name}" לאורך זמן:\n\n${reportsText}\n\nנתח את המגמות לאורך זמן: מה השתנה? מה משתפר? מה מדאיג? מה הסניף צריך? ספק ניתוח תמציתי ומעשי.`

      const res = await fetch('/.netlify/functions/hq-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ scope: 'all', domainFilter: null, messages: [{ role: 'user', content: question }], question }),
      })
      if (!res.ok) {
        setAiAnalysis('שגיאה בניתוח AI. נסה שוב.')
        return
      }
      const { reply } = await res.json() as { reply: string }
      setAiAnalysis(reply)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm" style={{ color: '#141348' }}>דיווחים — {branch.name}</h2>
            <p className="text-xs text-gray-400">{reports.length} דיווחים</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void runAiAnalysis()}
              disabled={analyzing || reports.length === 0}
              className="text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#189A9F' }}
            >
              {analyzing ? '⏳ מנתח...' : '✨ ניתוח AI'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {aiAnalysis && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              <div className="font-semibold text-xs mb-2" style={{ color: '#189A9F' }}>ניתוח AI — מגמות לאורך זמן</div>
              {aiAnalysis}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">טוען דיווחים...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">📋</div>
              <div className="text-sm">אין דיווחים עדיין לסניף זה</div>
              <div className="text-xs mt-1 text-gray-300">הרכז יכול להגיש דיווח מהפורטל</div>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => <ReportAccordion key={r.id} report={r} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type FullEditForm = {
  name: string
  city: string
  type: Branch['type']
  distributionFrequency: string
  distributionDay: string
  weeklyBaskets: number | null
  monthlyBaskets: number | null
  packagingTime: string
  distributionTime: string
  address: string
  acceptsGroups: boolean
}

/**
 * A branch's coordinators are the people holding the position linked to it.
 * They are edited through that position, so the org tree, the portal and this
 * page can never disagree.
 */
function BranchCoordinators({ branch, org }: { branch: Branch; org: OrgData }) {
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const linkedRoles = org.roles.filter((r) => r.portalBranchId === branch.id)

  const createRole = async () => {
    setCreating(true)
    try {
      const level = inferLevel(branch)
      const id = await saveRole(null, {
        roleName: 'רכז/ת סניף',
        area: branch.name.replace(/^סלי מזון - /, ''),
        level: (level === 'מועדוני נוער' ? 'בתי קפה נודדים' : level) as RoleLevel,
        status: 'חסר',
        priority: 'רגיל',
        linkedTaskIds: [],
        affectsTasks: false,
        delegatedTo: null,
        notes: '',
        portalBranchId: branch.id,
      }, org)
      setEditingRoleId(id)
    } finally {
      setCreating(false)
    }
  }

  const editingRole = editingRoleId ? org.roles.find((r) => r.id === editingRoleId) : undefined

  return (
    <div className="space-y-2">
      {linkedRoles.map((r) => (
        <div key={r.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2 bg-gray-50/60">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400">{r.roleName}{r.area ? ` · ${r.area}` : ''}</div>
            <div className="text-sm" style={{ color: '#141348' }}>
              {r.holderName || <span className="text-gray-400">לא מאויש</span>}
            </div>
          </div>
          <button type="button" onClick={() => setEditingRoleId(r.id)}
            className="text-xs border border-gray-200 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50 shrink-0">
            עדכון רכזים
          </button>
        </div>
      ))}
      {linkedRoles.length === 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span>אין תפקיד בעץ הארגוני שמקושר לסניף הזה, ולכן אין לו רכזים.</span>
          <button type="button" onClick={() => void createRole()} disabled={creating}
            className="border border-amber-300 bg-white rounded-lg px-3 py-1.5 shrink-0 disabled:opacity-50">
            {creating ? 'יוצר…' : 'צור תפקיד רכז/ת'}
          </button>
        </div>
      )}
      <p className="text-xs text-gray-400">
        הרכזים הם ממלאי התפקיד המקושר לסניף. אפשר לעדכן אותם גם ב<Link to="/roles" className="text-[#189A9F] hover:underline">איוש תפקידים</Link> או
        ב<Link to="/admin/users" className="text-[#189A9F] hover:underline">אנשים ומשתמשים</Link>.
      </p>
      {editingRole && (
        <RoleEditModal role={editingRole} allRoles={org.roles} people={org.people} onClose={() => setEditingRoleId(null)} />
      )}
    </div>
  )
}

function BranchEditPanel({ branch, org, onClose }: { branch: Branch; org: OrgData; onClose: () => void }) {
  const [form, setForm] = useState<FullEditForm>({
    name:                  branch.name,
    city:                  branch.city,
    type:                  branch.type,
    distributionFrequency: branch.distributionFrequency ?? '',
    distributionDay:       branch.distributionDay ?? '',
    weeklyBaskets:         branch.weeklyBaskets ?? null,
    monthlyBaskets:        branch.monthlyBaskets ?? null,
    packagingTime:         branch.packagingTime ?? '',
    distributionTime:      branch.distributionTime ?? '',
    address:               branch.address ?? '',
    acceptsGroups:         branch.acceptsGroups ?? false,
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'branches', branch.id), {
        name:                  form.name.trim() || branch.name,
        city:                  form.city.trim() || branch.city,
        type:                  form.type,
        distributionFrequency: form.distributionFrequency || null,
        distributionDay:       form.distributionDay || null,
        weeklyBaskets:         form.weeklyBaskets ?? null,
        monthlyBaskets:        form.monthlyBaskets ?? null,
        packagingTime:         form.packagingTime || null,
        distributionTime:      form.distributionTime || null,
        address:               form.address || null,
        acceptsGroups:         form.acceptsGroups,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-sm" style={{ color: '#141348' }}>עריכת סניף</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Basic info */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">שם הסניף</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">עיר</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">סוג</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Branch['type'] })}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]">
                <option value="food">סלי מזון</option>
                <option value="cafe_youth">בית קפה / נוער</option>
              </select>
            </div>
          </div>

          {/* Coordinators */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">רכזים</label>
            <BranchCoordinators branch={branch} org={org} />
          </div>

          {/* Operational */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">כתובת</label>
            <input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">תדירות חלוקה</label>
              {(() => {
                const isOther = form.distributionFrequency !== '' && !DIST_FREQ_OPTIONS.includes(form.distributionFrequency)
                const selectVal = isOther ? 'אחר' : (form.distributionFrequency ?? '')
                return (
                  <div className="space-y-1">
                    <select
                      value={selectVal}
                      onChange={(e) => {
                        if (e.target.value === 'אחר') setForm({ ...form, distributionFrequency: '' })
                        else setForm({ ...form, distributionFrequency: e.target.value })
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                    >
                      <option value="">—</option>
                      {DIST_FREQ_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {(selectVal === 'אחר' || isOther) && (
                      <input
                        placeholder="פרט תדירות..."
                        value={isOther ? form.distributionFrequency : ''}
                        onChange={(e) => setForm({ ...form, distributionFrequency: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                      />
                    )}
                  </div>
                )
              })()}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">יום חלוקה</label>
              <select value={form.distributionDay ?? ''} onChange={(e) => setForm({ ...form, distributionDay: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]">
                <option value="">—</option>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">סלים שבועי</label>
              <input type="number" value={form.weeklyBaskets ?? ''} onChange={(e) => setForm({ ...form, weeklyBaskets: e.target.value ? +e.target.value : null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">סלים חודשי</label>
              <input type="number" value={form.monthlyBaskets ?? ''} onChange={(e) => setForm({ ...form, monthlyBaskets: e.target.value ? +e.target.value : null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">שעת אריזה</label>
              <input value={form.packagingTime ?? ''} onChange={(e) => setForm({ ...form, packagingTime: e.target.value })}
                placeholder="09:00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">שעת חלוקה</label>
              <input value={form.distributionTime ?? ''} onChange={(e) => setForm({ ...form, distributionTime: e.target.value })}
                placeholder="10:00–12:00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" dir="ltr" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: '#141348' }}>
            <input type="checkbox" checked={form.acceptsGroups ?? false}
              onChange={(e) => setForm({ ...form, acceptsGroups: e.target.checked })}
              className="rounded" style={{ accentColor: '#189A9F' }} />
            מקבל קבוצות מתנדבים
          </label>
        </div>
        <div className="px-5 pb-5 flex gap-3 sticky bottom-0 bg-white pt-3 border-t border-gray-100">
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: '#189A9F' }}>
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

function AddBranchModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [type, setType] = useState<Branch['type']>('food')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim() || !city.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'branches'), {
        name: name.trim(),
        city: city.trim(),
        type,
        createdAt: serverTimestamp(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-sm" style={{ color: '#141348' }}>הוסף סניף חדש</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">שם הסניף *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="לדוג׳: סלי מזון - חיפה"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">עיר *</label>
              <input value={city} onChange={(e) => setCity(e.target.value)}
                placeholder="חיפה"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">סוג</label>
              <select value={type} onChange={(e) => setType(e.target.value as Branch['type'] )}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]">
                <option value="food">סלי מזון</option>
                <option value="cafe_youth">בית קפה / נוער</option>
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={save} disabled={saving || !name.trim() || !city.trim()}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר...' : 'צור סניף'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

function BranchCard({ branch, coordinators, org }: { branch: Branch; coordinators: RoleHolder[]; org: OrgData }) {
  const [editing, setEditing] = useState(false)
  const [viewingReports, setViewingReports] = useState(false)
  const color = TYPE_COLOR[branch.type]
  const level = inferLevel(branch)
  const levelStyle = LEVEL_COLORS[level]

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 flex items-start justify-between gap-2" style={{ borderRight: `4px solid ${color}` }}>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate" style={{ color: '#141348' }}>
              {branch.name.replace(/^סלי מזון - /, '').replace(/^מועדון נוער - /, '')}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-400">{branch.city}</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: levelStyle.bg, color: levelStyle.text }}
              >
                {level}
              </span>
            </div>
          </div>
          <span
            className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {TYPE_LABELS[branch.type]}
          </span>
        </div>

        {/* Coordinators */}
        {coordinators.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-50 bg-gray-50/50">
            <div className="text-xs text-gray-400 mb-1">רכזים</div>
            <div className="flex flex-wrap gap-1">
              {coordinators.map((c) => (
                <span key={c.uid} className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5" style={{ color: '#141348' }}>
                  👤 {c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Operational data */}
        <div className="px-4 py-3 flex-1 space-y-1.5 border-t border-gray-50">
          {branch.distributionFrequency && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-20">תדירות:</span>
              <span className="font-medium" style={{ color: '#141348' }}>{branch.distributionFrequency}</span>
            </div>
          )}
          {branch.distributionDay && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-20">יום חלוקה:</span>
              <span className="font-medium" style={{ color: '#141348' }}>{branch.distributionDay}</span>
            </div>
          )}
          {branch.packagingTime && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-20">אריזה:</span>
              <span className="font-medium" dir="ltr" style={{ color: '#141348' }}>{branch.packagingTime}</span>
            </div>
          )}
          {branch.distributionTime && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-20">חלוקה:</span>
              <span className="font-medium" dir="ltr" style={{ color: '#141348' }}>{branch.distributionTime}</span>
            </div>
          )}
          {(branch.weeklyBaskets || branch.monthlyBaskets) && (
            <div className="flex items-center gap-3 text-xs">
              {branch.weeklyBaskets && (
                <span className="rounded px-1.5 py-0.5 font-medium" style={{ backgroundColor: '#E6F4F4', color: '#189A9F' }}>
                  🧺 {branch.weeklyBaskets} שבועי
                </span>
              )}
              {branch.monthlyBaskets && (
                <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-medium">
                  {branch.monthlyBaskets} חודשי
                </span>
              )}
            </div>
          )}
          {branch.address && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-gray-400 w-20">כתובת:</span>
              <span style={{ color: '#141348' }}>{branch.address}</span>
            </div>
          )}
          {!branch.distributionFrequency && !branch.distributionDay && !branch.weeklyBaskets && !branch.address && (
            <div className="text-xs text-gray-400">אין נתוני תפעול — לחץ עריכה להוסיף</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewingReports(true)}
              className="text-xs hover:underline"
              style={{ color: '#189A9F' }}
            >
              📋 דיווחים
            </button>
            <a
              href="/orgchart"
              className="text-xs hover:underline text-gray-400"
              title="צפה בעץ הארגוני"
            >
              🌳 עץ ארגוני
            </a>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-xs hover:underline"
            style={{ color: '#141348' }}
          >
            ✏️ עריכה
          </button>
        </div>
      </div>

      {editing && <BranchEditPanel branch={branch} org={org} onClose={() => setEditing(false)} />}
      {viewingReports && <BranchReportsModal branch={branch} onClose={() => setViewingReports(false)} />}
    </>
  )
}

export function BranchesPage() {
  const { branches, loading } = useAllBranches()
  const { roles, people } = useRoles()
  const coordinatorsByBranch = useMemo(() => {
    const map: Record<string, RoleHolder[]> = {}
    for (const b of branches) map[b.id] = coordinatorsOfBranch(b.id, roles)
    return map
  }, [branches, roles])
  const [typeFilter, setTypeFilter] = useState<Branch['type'] | ''>('')
  const [levelFilter, setLevelFilter] = useState<BranchLevel | ''>('')
  const [cityFilter, setCityFilter] = useState('')
  const [search, setSearch] = useState('')
  const [addingBranch, setAddingBranch] = useState(false)

  const cities = useMemo(
    () => [...new Set(branches.map((b) => b.city))].sort(),
    [branches]
  )

  const filtered = useMemo(() => {
    return branches.filter((b) => {
      if (typeFilter && b.type !== typeFilter) return false
      if (levelFilter && inferLevel(b) !== levelFilter) return false
      if (cityFilter && b.city !== cityFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          b.name.toLowerCase().includes(q) ||
          b.city.toLowerCase().includes(q) ||
          (coordinatorsByBranch[b.id] ?? []).some((c) => c.name.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [branches, coordinatorsByBranch, typeFilter, levelFilter, cityFilter, search])

  const byCity = useMemo(() => {
    const groups: { city: string; branches: Branch[] }[] = []
    const seenCities = cityFilter ? [cityFilter] : cities.filter((c) => filtered.some((b) => b.city === c))
    for (const city of seenCities) {
      const cb = filtered.filter((b) => b.city === city)
      if (cb.length > 0) groups.push({ city, branches: cb })
    }
    return groups
  }, [filtered, cities, cityFilter])

  const totalBaskets = useMemo(
    () => branches.reduce((sum, b) => sum + (b.monthlyBaskets ?? 0), 0),
    [branches]
  )

  if (loading) return <Spinner size="lg" />

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>סניפים ({branches.length})</h1>
          {totalBaskets > 0 && (
            <div className="text-sm text-gray-500">סה"כ {totalBaskets.toLocaleString()} סלים לחודש</div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAddingBranch(true)}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#141348' }}
          >
            + סניף חדש
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="חיפוש..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F] w-full sm:w-48"
          style={{ direction: 'rtl' }}
        />
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
        >
          <option value="">כל הערים</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* One category row only. The old `type` row duplicated this: 'בית קפה /
            נוער' and 'בתי קפה נודדים' were the same set under two names. */}
        {(['', 'סניף ירושלים', 'סניף חוץ', 'בתי קפה נודדים', 'מועדוני נוער'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLevelFilter(l)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              backgroundColor: levelFilter === l ? (l === '' ? '#141348' : LEVEL_COLORS[l as BranchLevel].bg) : 'white',
              color: levelFilter === l ? (l === '' ? 'white' : LEVEL_COLORS[l as BranchLevel].text) : '#6B7280',
              borderColor: levelFilter === l ? '#141348' : '#E5E7EB',
              opacity: l === '' && levelFilter !== '' ? 0.6 : 1,
            }}
          >
            {l === '' ? 'כל הרמות' : l}
          </button>
        ))}
        {(search || typeFilter || levelFilter || cityFilter) && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); setLevelFilter(''); setCityFilter('') }}
            className="text-xs text-gray-400 hover:text-red-500 underline"
          >
            נקה
          </button>
        )}
      </div>

      {branches.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <div className="text-2xl mb-2">🏪</div>
          <div className="font-bold text-yellow-800 mb-1">אין סניפים להצגה</div>
        </div>
      )}

      {/* Cards grouped by city */}
      {byCity.map(({ city, branches: cityBranches }) => (
        <div key={city}>
          <h2 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: '#3A3A6B' }}>
            <span>📍 {city}</span>
            <span className="text-gray-400 font-normal">({cityBranches.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
            {cityBranches.map((b) => (
              <BranchCard key={b.id} branch={b} coordinators={coordinatorsByBranch[b.id] ?? []} org={{ roles, people }} />
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && branches.length > 0 && (
        <div className="text-center py-12 text-gray-400">אין סניפים תואמים</div>
      )}

      {addingBranch && <AddBranchModal onClose={() => setAddingBranch(false)} />}
    </div>
  )
}
