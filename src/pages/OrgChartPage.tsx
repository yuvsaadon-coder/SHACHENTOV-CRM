import { useState } from 'react'
import { useRoles } from '../hooks/useRoles'
import { OrgChartView } from '../components/orgchart/OrgChartView'
import { RoleEditModal } from '../components/roles/RoleEditModal'
import { Spinner } from '../components/ui/Spinner'
import type { OrgRole } from '../types'

export function OrgChartPage() {
  const { roles, loading, error } = useRoles()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<OrgRole | null>(null)

  const openEdit = (role: OrgRole) => { setSelectedRole(role); setModalOpen(true) }
  const openNew = () => { setSelectedRole(null); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setSelectedRole(null) }

  if (loading) return <Spinner size="lg" />
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600 font-medium mb-2">שגיאה בטעינת תפקידים</p>
      <p className="text-sm text-gray-500">{error}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>מבנה ארגוני</h1>
          <p className="text-sm text-gray-500 mt-0.5">לחץ על תפקיד לעריכה ולהגדרת כפיפות</p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#141348' }}
        >
          + תפקיד חדש
        </button>
      </div>

      <OrgChartView roles={roles} onEdit={openEdit} />

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
