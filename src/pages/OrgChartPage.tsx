import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRoles } from '../hooks/useRoles'
import { OrgChartView } from '../components/orgchart/OrgChartView'
import { BranchDetailsPanel } from '../components/orgchart/BranchDetailsPanel'
import { RoleEditModal } from '../components/roles/RoleEditModal'
import { Spinner } from '../components/ui/Spinner'
import type { OrgRole } from '../types'

export function OrgChartPage() {
  const { roles, loading, error } = useRoles()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<OrgRole | null>(null)
  const [detailsRole, setDetailsRole] = useState<OrgRole | null>(null)

  const openEdit = (role: OrgRole) => { setSelectedRole(role); setModalOpen(true) }
  const openNew = () => { setSelectedRole(null); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setSelectedRole(null) }
  const openDetails = (role: OrgRole) => setDetailsRole(role)
  const closeDetails = () => setDetailsRole(null)

  if (loading) return <Spinner size="lg" />
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600 font-medium mb-2">שגיאה בטעינת תפקידים</p>
      <p className="text-sm text-gray-500">{error}</p>
    </div>
  )

  const allUnlinked = roles.length > 0 && roles.every(r => !r.reportsTo)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>מבנה ארגוני</h1>
          <p className="text-sm text-gray-500 mt-0.5">לחץ על סניף לפרטים · לחץ על תפקיד מטה לעריכה</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/hierarchy"
            className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-gray-50 transition-colors"
            style={{ color: '#141348', borderColor: '#E5E7EB' }}
          >
            הגדר כפיפויות
          </Link>
          <button
            onClick={openNew}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#141348' }}
          >
            + תפקיד חדש
          </button>
        </div>
      </div>

      {allUnlinked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="text-sm text-amber-800">
            <strong>עץ הכפיפויות טרם הוגדר.</strong> כל {roles.length} התפקידים מוצגים ללא קשרי כפיפות — לחץ על "הגדר כפיפויות" להפעלת האשף האוטומטי.
          </div>
          <Link
            to="/admin/hierarchy"
            className="px-4 py-2 text-sm font-medium rounded-lg text-white shrink-0 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#189A9F' }}
          >
            הגדר כפיפויות ←
          </Link>
        </div>
      )}

      <OrgChartView roles={roles} onEdit={openEdit} onBranchDetails={openDetails} />

      {detailsRole && (
        <BranchDetailsPanel
          role={detailsRole}
          onClose={closeDetails}
          onEditRole={(r) => { closeDetails(); openEdit(r) }}
        />
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
