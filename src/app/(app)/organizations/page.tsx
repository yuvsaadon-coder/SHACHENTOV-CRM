'use client'

import { useEffect, useState, useMemo } from 'react'
import { getAllOrganizations, createOrganization } from '@/lib/firestore'
import type { Organization, SectorType } from '@/types/crm'
import { SectorBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Plus, Search, X } from 'lucide-react'
import { SECTORS } from '@/lib/taxonomy'
import { generateOrgId } from '@/lib/utils'

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgSector, setNewOrgSector] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    getAllOrganizations().then(data => { setOrgs(data); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    if (!search) return orgs
    const q = search.toLowerCase()
    return orgs.filter(o => o.name.toLowerCase().includes(q))
  }, [orgs, search])

  async function handleCreate() {
    if (!newOrgName.trim()) return
    setCreating(true)
    const id = generateOrgId()
    await createOrganization({
      id,
      name: newOrgName.trim(),
      sector: (newOrgSector as SectorType) || undefined,
    })
    setOrgs(prev => [...prev, {
      id,
      name: newOrgName.trim(),
      sector: (newOrgSector as SectorType) || undefined,
      createdAt: new Date() as any,
    }])
    setNewOrgName('')
    setNewOrgSector('')
    setShowForm(false)
    setCreating(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ארגונים</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '...' : `${orgs.length.toLocaleString('he-IL')} ארגונים`}
          </p>
        </div>
        <Button
          size="sm"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setShowForm(!showForm)}
        >
          ארגון חדש
        </Button>
      </div>

      {/* Inline new org form */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-end gap-3 flex-wrap">
          <Input
            label="שם ארגון"
            value={newOrgName}
            onChange={e => setNewOrgName(e.target.value)}
            placeholder="שם הארגון..."
            className="min-w-48"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <Select
            label="מגזר"
            value={newOrgSector}
            onChange={e => setNewOrgSector(e.target.value)}
            className="min-w-36"
          >
            <option value="">בחר מגזר...</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <div className="flex gap-2">
            <Button size="sm" loading={creating} onClick={handleCreate} disabled={!newOrgName.trim()}>
              שמור
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="search"
          placeholder="חיפוש ארגון..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-9 pe-10 ps-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>שם ארגון</th>
              <th>מגזר</th>
              <th>מחוז</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array(6).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(3).fill(0).map((_, j) => (
                    <td key={j}><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-12 text-gray-400">לא נמצאו ארגונים</td>
              </tr>
            ) : (
              filtered.map(org => (
                <tr key={org.id}>
                  <td className="font-medium text-sm text-gray-900">{org.name}</td>
                  <td><SectorBadge sector={org.sector} /></td>
                  <td className="text-sm text-gray-500">{org.district ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
