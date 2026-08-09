import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useRoles, applyDelegation } from '../hooks/useRoles'
import { exportRoles } from '../utils/export'
import { useTasks } from '../hooks/useTasks'
import { Spinner } from '../components/ui/Spinner'
import { RoleEditModal } from '../components/roles/RoleEditModal'
import type { RoleLevel, RoleStatus, OrgRole } from '../types'
import { ROLE_LEVELS, ROLE_STATUS_LABELS } from '../types'

const STATUS_STYLES: Record<RoleStatus, string> = {
  'מאויש': 'bg-[#C6EFCE] text-[#0A6B2E]',
  'חסר': 'bg-red-100 text-red-700',
  'חלקי': 'bg-orange-100 text-orange-700',
  'בסיכון': 'bg-[#FDC857] text-[#7A5A00]',
  'אחר': 'bg-[#E4DFEC] text-[#5F497A]',
}

const STATUS_SELECT_STYLE: Record<RoleStatus, React.CSSProperties> = {
  'מאויש': { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'חסר':   { backgroundColor: '#FEE2E2', color: '#B91C1C' },
  'חלקי':  { backgroundColor: '#FED7AA', color: '#9A3412' },
  'בסיכון':{ backgroundColor: '#FDC857', color: '#7A5A00' },
  'אחר':   { backgroundColor: '#E4DFEC', color: '#5F497A' },
}

async function updateRoleStatus(roleId: string, status: RoleStatus) {
  await updateDoc(doc(db, 'roles', roleId), { status, updatedAt: serverTimestamp() })
}

const PRIORITY_STYLES: Record<string, string> = {
  'רגיל': 'text-gray-400',
  'בינוני': 'text-orange-500',
  'דחוף': 'text-red-600 font-bold',
}

const LEVEL_BG_COLOR: Record<string, string> = {
  'מטה':             '#141348',
  'סניף חוץ':        '#3A3A6B',
  'סניף ירושלים':    '#189A9F',
  'בתי קפה נודדים':  '#147F84',
  'טוסטר':           '#0A6B2E',
  'סניפים עיתיים':   '#5F497A',
  'יריד':            '#7A5A00',
}


export function RolesPage() {
  const { roles, loading, error } = useRoles()
  const { tasks } = useTasks()
  const [levelFilter, setLevelFilter] = useState<RoleLevel | ''>('')
  const [statusFilter, setStatusFilter] = useState<RoleStatus | ''>('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<OrgRole | null>(null)

  const openEdit = (role: OrgRole) => { setSelectedRole(role); setModalOpen(true) }
  const openNew = () => { setSelectedRole(null); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setSelectedRole(null) }

  const withDelegation = useMemo(() => roles.map(applyDelegation), [roles])

  const filtered = useMemo(() => {
    return withDelegation.filter((r) => {
      if (levelFilter && r.level !== levelFilter) return false
      if (statusFilter && r.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          r.roleName.toLowerCase().includes(q) ||
          r.holderName.toLowerCase().includes(q) ||
          r.area.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [withDelegation, levelFilter, statusFilter, search])

  const grouped = useMemo(() => {
    const groups: Record<string, OrgRole[]> = {}
    for (const role of filtered) {
      if (!groups[role.level]) groups[role.level] = []
      groups[role.level].push(role)
    }
    return ROLE_LEVELS.filter((l) => groups[l]).map((l) => ({ level: l, roles: groups[l] }))
  }, [filtered])

  const stats = useMemo(() => {
    const byStatus: Record<RoleStatus, number> = { 'מאויש': 0, 'חסר': 0, 'חלקי': 0, 'בסיכון': 0, 'אחר': 0 }
    roles.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1 })
    return byStatus
  }, [roles])

  const taskMap = useMemo(() => {
    const m: Record<string, string> = {}
    tasks.forEach((t) => { m[t.id] = t.title })
    return m
  }, [tasks])

  if (loading) return <Spinner size="lg" />
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600 font-medium mb-2">שגיאה בטעינת תפקידים</p>
      <p className="text-sm text-gray-500">{error}</p>
      <p className="text-xs text-gray-400 mt-2">ודא שכללי Firestore מאפשרים קריאה לאוסף roles</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-navy">איוש תפקידים</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{roles.length} תפקידים</span>
          <button
            onClick={() => exportRoles(roles)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          >
            ייצוא CSV
          </button>
          <button
            onClick={openNew}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#141348' }}
          >
            + תפקיד חדש
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ROLE_STATUS_LABELS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${STATUS_STYLES[s]} ${statusFilter === s ? 'ring-2 ring-brand-navy' : 'opacity-80 hover:opacity-100'}`}
          >
            {s}: {stats[s]}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="חיפוש שם / תפקיד / אזור..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-52"
        />
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as RoleLevel | '')}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          <option value="">כל הרמות</option>
          {ROLE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RoleStatus | '')}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          <option value="">כל הסטטוסים</option>
          {ROLE_STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(levelFilter || statusFilter || search) && (
          <button
            onClick={() => { setLevelFilter(''); setStatusFilter(''); setSearch('') }}
            className="text-xs text-gray-500 hover:text-red-500 underline"
          >
            נקה מסננים
          </button>
        )}
        <span className="text-xs text-gray-400 mr-auto">{filtered.length} תוצאות</span>
      </div>

      {grouped.map(({ level, roles: groupRoles }) => (
        <div key={level} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{ backgroundColor: LEVEL_BG_COLOR[level] || '#141348' }}
          >
            <span className="text-white font-semibold text-sm">{level}</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{groupRoles.length} תפקידים</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">תפקיד</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">ממלא תפקיד</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">סטטוס</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">עדיפות</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">משימות / הערות</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">פרטי קשר</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {groupRoles.map((role) => {
                const linkedTasks = (role.linkedTaskIds || [])
                  .map((tid) => ({ id: tid, title: taskMap[tid] }))
                  .filter((t) => t.title)
                return (
                  <tr key={role.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-brand-navy">{role.roleName}</div>
                      {role.area && <div className="text-xs text-gray-400">{role.area}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {role.holderName || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={role.status}
                        onChange={(e) => updateRoleStatus(role.id, e.target.value as RoleStatus)}
                        onClick={(e) => e.stopPropagation()}
                        style={STATUS_SELECT_STYLE[role.status]}
                        className="text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-teal"
                      >
                        {ROLE_STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {role.delegatedTo && (
                        <div className="mt-1.5">
                          <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">
                            מואצל: {role.delegatedTo}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-xs ${PRIORITY_STYLES[role.priority] || ''}`}>
                      {role.priority}
                    </td>
                    <td className="px-4 py-3">
                      {role.affectsTasks && linkedTasks.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {linkedTasks.map((t) => (
                            <Link
                              key={t.id}
                              to={`/tasks/${t.id}`}
                              className="text-xs bg-brand-teal050 text-brand-teal px-2 py-0.5 rounded hover:underline"
                            >
                              {t.title}
                            </Link>
                          ))}
                        </div>
                      )}
                      {role.notes && (
                        <div className="text-xs text-gray-400 leading-relaxed">{role.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {role.phone && <div dir="ltr">{role.phone}</div>}
                      {role.email && <div className="text-gray-400 truncate max-w-[140px]">{role.email}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => openEdit(role)}
                        className="text-gray-300 hover:text-[#189A9F] transition-colors p-1 rounded"
                        title="עריכה"
                      >
                        ✏️
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      ))}

      {grouped.length === 0 && (
        <div className="text-center py-12 text-gray-400">אין תפקידים להצגה</div>
      )}

      {modalOpen && (
        <RoleEditModal
          role={selectedRole}
          allRoles={roles}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
