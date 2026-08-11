import { useState, useMemo } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAllBranches } from '../hooks/useBranch'
import { Spinner } from '../components/ui/Spinner'
import type { Branch } from '../types'
import { DIST_FREQ_OPTIONS } from '../types'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'משתנה']

const TYPE_LABELS: Record<Branch['type'], string> = {
  food: 'סלי מזון',
  cafe_youth: 'בית קפה / נוער',
}
const TYPE_COLOR: Record<Branch['type'], string> = {
  food: '#189A9F',
  cafe_youth: '#FDC857',
}

type EditForm = Pick<Branch,
  'distributionFrequency' | 'distributionDay' |
  'weeklyBaskets' | 'monthlyBaskets' |
  'packagingTime' | 'distributionTime' | 'address' | 'acceptsGroups'
>

function BranchEditPanel({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const [form, setForm] = useState<EditForm>({
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
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-brand-navy">{branch.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">כתובת</label>
            <input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">תדירות חלוקה</label>
              <select value={form.distributionFrequency ?? ''} onChange={(e) => setForm({ ...form, distributionFrequency: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal">
                <option value="">—</option>
                {DIST_FREQ_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">יום חלוקה</label>
              <select value={form.distributionDay ?? ''} onChange={(e) => setForm({ ...form, distributionDay: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal">
                <option value="">—</option>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">סלים שבועי</label>
              <input type="number" value={form.weeklyBaskets ?? ''} onChange={(e) => setForm({ ...form, weeklyBaskets: e.target.value ? +e.target.value : null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">סלים חודשי</label>
              <input type="number" value={form.monthlyBaskets ?? ''} onChange={(e) => setForm({ ...form, monthlyBaskets: e.target.value ? +e.target.value : null })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">שעת אריזה</label>
              <input value={form.packagingTime ?? ''} onChange={(e) => setForm({ ...form, packagingTime: e.target.value })}
                placeholder="09:00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">שעת חלוקה</label>
              <input value={form.distributionTime ?? ''} onChange={(e) => setForm({ ...form, distributionTime: e.target.value })}
                placeholder="10:00–12:00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" dir="ltr" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-brand-navy">
            <input type="checkbox" checked={form.acceptsGroups ?? false}
              onChange={(e) => setForm({ ...form, acceptsGroups: e.target.checked })}
              className="rounded" />
            מקבל קבוצות מתנדבים
          </label>
        </div>
        <div className="px-5 pb-5 flex gap-3">
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

function BranchCard({ branch }: { branch: Branch }) {
  const [editing, setEditing] = useState(false)
  const color = TYPE_COLOR[branch.type]

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 flex items-start justify-between gap-2" style={{ borderRight: `4px solid ${color}` }}>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-brand-navy truncate">
              {branch.name.replace(/^סלי מזון - /, '').replace(/^מועדון נוער - /, '')}
            </div>
            <div className="text-xs text-gray-400">{branch.city}</div>
          </div>
          <span
            className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {TYPE_LABELS[branch.type]}
          </span>
        </div>

        {/* Coordinators */}
        {(branch.coordinatorNames ?? []).length > 0 && (
          <div className="px-4 py-2 border-t border-gray-50 bg-gray-50/50">
            <div className="text-xs text-gray-400 mb-1">רכזים</div>
            <div className="flex flex-wrap gap-1">
              {(branch.coordinatorNames ?? []).map((name) => (
                <span key={name} className="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-brand-navy">
                  👤 {name}
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
              <span className="font-medium text-brand-navy">{branch.distributionFrequency}</span>
            </div>
          )}
          {branch.distributionDay && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-20">יום חלוקה:</span>
              <span className="font-medium text-brand-navy">{branch.distributionDay}</span>
            </div>
          )}
          {branch.packagingTime && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-20">אריזה:</span>
              <span className="font-medium text-brand-navy" dir="ltr">{branch.packagingTime}</span>
            </div>
          )}
          {branch.distributionTime && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-20">חלוקה:</span>
              <span className="font-medium text-brand-navy" dir="ltr">{branch.distributionTime}</span>
            </div>
          )}
          {(branch.weeklyBaskets || branch.monthlyBaskets) && (
            <div className="flex items-center gap-3 text-xs">
              {branch.weeklyBaskets && (
                <span className="bg-brand-teal050 text-brand-teal rounded px-1.5 py-0.5 font-medium">
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
              <span className="text-brand-navy">{branch.address}</span>
            </div>
          )}
          {!branch.distributionFrequency && !branch.distributionDay && !branch.weeklyBaskets && !branch.address && (
            <div className="text-xs text-gray-400">אין נתוני תפעול — לחץ עריכה להוסיף</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 flex justify-end">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-brand-teal hover:underline"
          >
            ✏️ עריכה
          </button>
        </div>
      </div>

      {editing && <BranchEditPanel branch={branch} onClose={() => setEditing(false)} />}
    </>
  )
}

export function BranchesPage() {
  const { branches, loading } = useAllBranches()
  const [typeFilter, setTypeFilter] = useState<Branch['type'] | ''>('')
  const [cityFilter, setCityFilter] = useState('')
  const [search, setSearch] = useState('')

  const cities = useMemo(
    () => [...new Set(branches.map((b) => b.city))].sort(),
    [branches]
  )

  const filtered = useMemo(() => {
    return branches.filter((b) => {
      if (typeFilter && b.type !== typeFilter) return false
      if (cityFilter && b.city !== cityFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          b.name.toLowerCase().includes(q) ||
          b.city.toLowerCase().includes(q) ||
          (b.coordinatorNames ?? []).some((n) => n.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [branches, typeFilter, cityFilter, search])

  const byCity = useMemo(() => {
    const groups: { city: string; branches: Branch[] }[] = []
    const seenCities = cityFilter ? [cityFilter] : cities.filter((c) => filtered.some((b) => b.city === c))
    for (const city of seenCities) {
      const cb = filtered.filter((b) => b.city === city)
      if (cb.length > 0) groups.push({ city, branches: cb })
    }
    return groups
  }, [filtered, cities, cityFilter])

  // Summary stats
  const totalBaskets = useMemo(
    () => branches.reduce((sum, b) => sum + (b.monthlyBaskets ?? 0), 0),
    [branches]
  )

  if (loading) return <Spinner size="lg" />

  if (branches.length === 0) {
    return (
      <div className="space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold text-brand-navy">סניפים</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <div className="text-2xl mb-2">🌱</div>
          <div className="font-bold text-yellow-800 mb-1">מסד הנתונים ריק</div>
          <div className="text-sm text-yellow-700">יש להריץ את הסידינג כדי לטעון את הסניפים והרכזים.</div>
          <a href="/admin/seed" className="mt-3 inline-block text-sm text-brand-teal hover:underline">
            → עמוד הסידינג
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">סניפים ({branches.length})</h1>
          {totalBaskets > 0 && (
            <div className="text-sm text-gray-500">סה"כ {totalBaskets.toLocaleString()} סלים לחודש</div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="חיפוש..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-full sm:w-48"
        />
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          <option value="">כל הערים</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(['', 'food', 'cafe_youth'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              backgroundColor: typeFilter === t ? (t === 'food' ? '#189A9F' : t === 'cafe_youth' ? '#FDC857' : '#141348') : 'white',
              color: typeFilter === t ? (t === 'cafe_youth' ? '#7A5A00' : 'white') : '#6B7280',
              borderColor: typeFilter === t ? (t === 'food' ? '#189A9F' : t === 'cafe_youth' ? '#FDC857' : '#141348') : '#E5E7EB',
            }}
          >
            {t === '' ? 'הכל' : TYPE_LABELS[t]}
          </button>
        ))}
        {(search || typeFilter || cityFilter) && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); setCityFilter('') }}
            className="text-xs text-gray-400 hover:text-red-500 underline"
          >
            נקה
          </button>
        )}
      </div>

      {/* Cards grouped by city */}
      {byCity.map(({ city, branches: cityBranches }) => (
        <div key={city}>
          <h2 className="text-sm font-bold text-brand-navy2 mb-2 flex items-center gap-2">
            <span>📍 {city}</span>
            <span className="text-gray-400 font-normal">({cityBranches.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
            {cityBranches.map((b) => <BranchCard key={b.id} branch={b} />)}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">אין סניפים תואמים</div>
      )}
    </div>
  )
}
