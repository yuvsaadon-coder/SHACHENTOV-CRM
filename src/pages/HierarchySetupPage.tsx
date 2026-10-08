import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { OrgRole } from '../types'

interface RowState { reportsTo: string | null }

export function HierarchySetupPage() {
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [loading, setLoading] = useState(true)
  const [changes, setChanges] = useState<Record<string, RowState>>({})
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    getDocs(collection(db, 'roles')).then(snap => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgRole))
      setRoles(loaded)
      // seed changes from existing reportsTo
      const seed: Record<string, RowState> = {}
      for (const r of loaded) seed[r.id] = { reportsTo: r.reportsTo ?? null }
      setChanges(seed)
      setLoading(false)
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  const filteredRoles = useMemo(() => {
    if (!search.trim()) return roles
    const q = search.trim().toLowerCase()
    return roles.filter(r =>
      r.roleName.toLowerCase().includes(q) ||
      (r.holderName ?? '').toLowerCase().includes(q) ||
      (r.level ?? '').toLowerCase().includes(q)
    )
  }, [roles, search])

  const setParent = (roleId: string, parentId: string | null) => {
    setChanges(prev => ({ ...prev, [roleId]: { reportsTo: parentId } }))
  }

  const isDirty = (roleId: string) => {
    const orig = roles.find(r => r.id === roleId)
    return (orig?.reportsTo ?? null) !== (changes[roleId]?.reportsTo ?? null)
  }

  const dirtyCount = roles.filter(r => isDirty(r.id)).length

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      let count = 0
      for (const role of roles) {
        if (isDirty(role.id)) {
          batch.update(doc(db, 'roles', role.id), { reportsTo: changes[role.id]?.reportsTo ?? null })
          count++
        }
      }
      await batch.commit()
      // refresh roles
      const snap = await getDocs(collection(db, 'roles'))
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgRole))
      setRoles(loaded)
      const seed: Record<string, RowState> = {}
      for (const r of loaded) seed[r.id] = { reportsTo: r.reportsTo ?? null }
      setChanges(seed)
      setSavedCount(count)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">טוען תפקידים...</div>
  if (error && !roles.length) return <div className="p-8 text-center text-red-600">{error}</div>

  return (
    <div className="space-y-4 max-w-5xl" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>הגדרת כפיפויות</h1>
          <p className="text-sm text-gray-500 mt-0.5">לכל תפקיד בחר את הממונה הישיר שלו בעץ הארגוני</p>
        </div>
        <div className="flex items-center gap-3">
          {dirtyCount > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              {dirtyCount} שינויים לא שמורים
            </span>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving || dirtyCount === 0}
            className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: '#141348' }}
          >
            {saving ? 'שומר...' : `שמור שינויים${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        </div>
      </div>

      {savedCount > 0 && !dirtyCount && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          ✓ {savedCount} תפקידים עודכנו בהצלחה
        </div>
      )}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש לפי שם תפקיד, שם, רמה..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600 w-1/3">תפקיד</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600 w-1/5">ממלא תפקיד</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600 w-1/5">רמה</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-600">כפוף ל-</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoles.map((role) => {
              const dirty = isDirty(role.id)
              const currentParent = changes[role.id]?.reportsTo ?? null
              return (
                <tr
                  key={role.id}
                  className={`border-b border-gray-50 ${dirty ? 'bg-amber-50' : ''}`}
                >
                  <td className="px-4 py-2.5 font-medium" style={{ color: '#141348' }}>{role.roleName}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{role.holderName || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{role.level || '—'}</td>
                  <td className="px-4 py-2 min-w-[220px]">
                    <select
                      value={currentParent ?? ''}
                      onChange={(e) => setParent(role.id, e.target.value || null)}
                      className={`w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#189A9F] ${dirty ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}
                    >
                      <option value="">— אין ממונה (שורש) —</option>
                      {roles
                        .filter(r => r.id !== role.id)
                        .map(r => (
                          <option key={r.id} value={r.id}>
                            {r.roleName}{r.holderName ? ` (${r.holderName})` : ''}
                          </option>
                        ))
                      }
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
