import { useState, useEffect } from 'react'
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { OrgRole } from '../types'

const JLM_FOOD = ['קרית יובל', 'רמות', 'גילה', 'נחלאות', 'בקעה', 'קטמון', 'נוה יעקב']
const EXT_BRANCHES = ['תל אביב', 'בית שמש', 'טבריה', 'צפת', 'קדימה', 'באר שבע', 'קרית שמונה']
const HOLIDAY_BRANCHES = ['מעלה אדומים', 'פתח תקווה']

function matchesList(role: OrgRole, list: string[]): boolean {
  const haystack = `${role.roleName} ${role.area}`.toLowerCase()
  return list.some(v => haystack.includes(v.toLowerCase()))
}

function computeChanges(roles: OrgRole[]) {
  const ceo = roles.find(r =>
    r.roleName.includes('מנכ') || r.holderName === 'יובל סעדון'
  )
  const jlm = roles.find(r =>
    r.holderName === 'כרמל קרופפלד' ||
    (r.level === 'סניף ירושלים' && r.roleName.includes('רכז'))
  )

  if (!ceo || !jlm) return { ceo, jlm, changes: [] as Change[] }

  const changes: Change[] = []

  for (const role of roles) {
    if (role.id === ceo.id) {
      changes.push({ role, reportsTo: null, area: role.area })
      continue
    }
    if (role.id === jlm.id) {
      changes.push({ role, reportsTo: ceo.id, area: role.area })
      continue
    }

    // Jerusalem food branches
    if (matchesList(role, JLM_FOOD)) {
      changes.push({ role, reportsTo: jlm.id, area: 'סניפי מזון ירושלים' })
      continue
    }
    // Any other Jerusalem branch level → under JLM coordinator
    if (role.level === 'סניף ירושלים') {
      changes.push({ role, reportsTo: jlm.id, area: role.area })
      continue
    }
    // External branches
    if (matchesList(role, EXT_BRANCHES) || role.level === 'סניף חוץ') {
      changes.push({ role, reportsTo: ceo.id, area: 'סניפי חוץ' })
      continue
    }
    // Holiday branches
    if (matchesList(role, HOLIDAY_BRANCHES)) {
      changes.push({ role, reportsTo: ceo.id, area: 'סניפי חגים' })
      continue
    }
    // Wandering cafes, youth clubs, fairs, toaster — all under CEO
    if (['בתי קפה נודדים', 'טוסטר', 'סניפים עיתיים', 'יריד'].includes(role.level)) {
      changes.push({ role, reportsTo: ceo.id, area: role.area })
      continue
    }
    // Headquarters roles — no parent (peers of CEO)
    changes.push({ role, reportsTo: null, area: role.area })
  }

  return { ceo, jlm, changes }
}

type Change = { role: OrgRole; reportsTo: string | null; area: string }

export function HierarchySetupPage() {
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getDocs(collection(db, 'roles')).then(snap => {
      setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgRole)))
      setLoading(false)
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  const { ceo, jlm, changes } = computeChanges(roles)
  const nameMap = Object.fromEntries(roles.map(r => [r.id, r.roleName]))

  const apply = async () => {
    setApplying(true)
    setError('')
    try {
      const batch = writeBatch(db)
      for (const { role, reportsTo, area } of changes) {
        batch.update(doc(db, 'roles', role.id), { reportsTo: reportsTo ?? null, area })
      }
      await batch.commit()
      setDone(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">טוען תפקידים...</div>
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>

  if (done) return (
    <div className="p-8 text-center space-y-3">
      <div className="text-4xl">✅</div>
      <div className="text-xl font-bold text-brand-navy">עץ הכפיפויות עודכן בהצלחה</div>
      <div className="text-sm text-gray-500">{changes.length} תפקידים עודכנו</div>
      <a href="/orgchart" className="inline-block mt-4 px-4 py-2 bg-brand-teal text-white rounded-lg text-sm">
        עבור לתרשים ארגוני
      </a>
    </div>
  )

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-brand-navy">הגדרת עץ כפיפויות</h1>

      {(!ceo || !jlm) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          לא נמצא {!ceo ? 'תפקיד מנכ"ל' : ''} {!jlm ? 'רכז ירושלים (כרמל קרופפלד)' : ''}.
          ודא שהתפקידים קיימים בFirestore עם השמות הנכונים.
        </div>
      )}

      {ceo && jlm && (
        <>
          <div className="bg-brand-teal050 border border-brand-teal rounded-xl p-4 text-sm space-y-1">
            <div>🏗 שורש: <strong>{ceo.roleName}</strong> ({ceo.holderName})</div>
            <div>🏙 רכז ירושלים: <strong>{jlm.roleName}</strong> ({jlm.holderName})</div>
            <div className="text-gray-500 text-xs mt-2">תצוגה מקדימה של {changes.length} שינויים — בדוק לפני הפעלה</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">תפקיד</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">רמה</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">כפוף ל-</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">אזור חדש</th>
                </tr>
              </thead>
              <tbody>
                {changes.map(({ role, reportsTo, area }) => (
                  <tr key={role.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-brand-navy">{role.roleName}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{role.level}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {reportsTo ? (nameMap[reportsTo] || reportsTo) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {area !== role.area
                        ? <span className="text-brand-teal font-medium">{area} ←<span className="text-gray-400 mr-1">{role.area || '—'}</span></span>
                        : <span className="text-gray-400">{area || '—'}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={apply}
              disabled={applying}
              className="px-6 py-2.5 bg-brand-navy text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {applying ? 'מעדכן...' : `הפעל (${changes.length} תפקידים)`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
