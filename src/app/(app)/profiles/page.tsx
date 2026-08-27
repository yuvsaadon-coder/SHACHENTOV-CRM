'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { getAllProfiles } from '@/lib/firestore'
import type { Profile, CommunityStatus, SectorType, EngagementLevel } from '@/types/crm'
import { SECTORS, ENGAGEMENT_LEVELS, COMMUNITY_STATUSES } from '@/lib/taxonomy'
import {
  CommunityStatusBadge,
  EngagementBadge,
  SectorBadge,
} from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ProfileDrawer } from '@/components/profiles/ProfileDrawer'
import { ProfileForm } from '@/components/profiles/ProfileForm'
import {
  Search,
  Plus,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  X,
} from 'lucide-react'
import { exportProfilesToXlsx } from '@/lib/export'
import { cn } from '@/lib/utils'

type SortField = 'lastName' | 'engagementScore' | 'currentSector' | 'communityStatus'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 25

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSector, setFilterSector] = useState('')
  const [filterEngagement, setFilterEngagement] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortField, setSortField] = useState<SortField>('lastName')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const loadProfiles = useCallback(async () => {
    setLoading(true)
    const data = await getAllProfiles()
    setProfiles(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  // Filter + sort in memory
  const filtered = useMemo(() => {
    let result = profiles

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.phone?.includes(q) ||
        p.organizationName?.toLowerCase().includes(q) ||
        p.role?.toLowerCase().includes(q)
      )
    }

    if (filterSector) result = result.filter(p => p.currentSector === filterSector)
    if (filterEngagement) result = result.filter(p => p.engagementLevel === filterEngagement)
    if (filterStatus) result = result.filter(p => p.communityStatus === filterStatus)

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortField) {
        case 'lastName':
          aVal = a.lastName ?? ''
          bVal = b.lastName ?? ''
          break
        case 'engagementScore':
          aVal = a.engagementScore ?? 0
          bVal = b.engagementScore ?? 0
          break
        case 'currentSector':
          aVal = a.currentSector ?? ''
          bVal = b.currentSector ?? ''
          break
        case 'communityStatus':
          aVal = a.communityStatus ?? ''
          bVal = b.communityStatus ?? ''
          break
      }

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [profiles, search, filterSector, filterEngagement, filterStatus, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 text-gray-400" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />
  }

  const hasFilters = filterSector || filterEngagement || filterStatus

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">פרופילים</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '...' : `${filtered.length.toLocaleString('he-IL')} פרופילים`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => exportProfilesToXlsx(filtered)}
            disabled={filtered.length === 0}
          >
            ייצוא Excel
          </Button>
          <Button
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => { setEditProfile(null); setShowForm(true) }}
          >
            פרופיל חדש
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="חיפוש לפי שם, ארגון, תפקיד..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full h-9 pe-10 ps-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<Filter className="w-3.5 h-3.5" />}
          onClick={() => setShowFilters(!showFilters)}
          className={cn(hasFilters && 'border-blue-400 text-blue-600 bg-blue-50')}
        >
          סינון {hasFilters ? `(${[filterSector, filterEngagement, filterStatus].filter(Boolean).length})` : ''}
        </Button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <select
            value={filterSector}
            onChange={e => { setFilterSector(e.target.value); setPage(1) }}
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">כל המגזרים</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={filterEngagement}
            onChange={e => { setFilterEngagement(e.target.value); setPage(1) }}
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">כל רמות המעורבות</option>
            {ENGAGEMENT_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">כל הסטטוסים</option>
            {COMMUNITY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {hasFilters && (
            <button
              onClick={() => { setFilterSector(''); setFilterEngagement(''); setFilterStatus('') }}
              className="flex items-center gap-1 h-8 px-3 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <X className="w-3.5 h-3.5" />
              נקה סינון
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('lastName')}
                >
                  <div className="flex items-center gap-1">
                    שם <SortIcon field="lastName" />
                  </div>
                </th>
                <th>ארגון</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('currentSector')}
                >
                  <div className="flex items-center gap-1">
                    מגזר <SortIcon field="currentSector" />
                  </div>
                </th>
                <th>תפקיד</th>
                <th>אזור</th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('communityStatus')}
                >
                  <div className="flex items-center gap-1">
                    סטטוס <SortIcon field="communityStatus" />
                  </div>
                </th>
                <th
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('engagementScore')}
                >
                  <div className="flex items-center gap-1">
                    מעורבות <SortIcon field="engagementScore" />
                  </div>
                </th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j}>
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    לא נמצאו פרופילים
                  </td>
                </tr>
              ) : (
                paginated.map(profile => (
                  <tr key={profile.id}>
                    <td>
                      <button
                        onClick={() => setSelectedProfile(profile)}
                        className="flex items-center gap-2.5 hover:text-blue-600 text-start"
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                          {profile.firstName?.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">
                            {profile.firstName} {profile.lastName}
                          </div>
                          {profile.email && (
                            <div className="text-xs text-gray-400">{profile.email}</div>
                          )}
                        </div>
                      </button>
                    </td>
                    <td>
                      <span className="text-sm text-gray-700 truncate max-w-36 block">
                        {profile.organizationName ?? '—'}
                      </span>
                    </td>
                    <td>
                      <SectorBadge sector={profile.currentSector} />
                    </td>
                    <td>
                      <span className="text-sm text-gray-600 truncate max-w-40 block">
                        {profile.role ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-gray-600">{profile.district ?? '—'}</span>
                    </td>
                    <td>
                      <CommunityStatusBadge status={profile.communityStatus} />
                    </td>
                    <td>
                      <EngagementBadge level={profile.engagementLevel} />
                    </td>
                    <td>
                      <button
                        onClick={() => { setEditProfile(profile); setShowForm(true) }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        עריכה
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              עמוד {page} מתוך {totalPages} ({filtered.length} תוצאות)
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded border border-gray-200 text-sm disabled:opacity-40 hover:bg-white"
              >
                הקודם
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded border border-gray-200 text-sm disabled:opacity-40 hover:bg-white"
              >
                הבא
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile drawer */}
      {selectedProfile && (
        <ProfileDrawer
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
          onEdit={() => { setEditProfile(selectedProfile); setShowForm(true); setSelectedProfile(null) }}
        />
      )}

      {/* Create/Edit form modal */}
      {showForm && (
        <ProfileForm
          profile={editProfile}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadProfiles() }}
        />
      )}
    </div>
  )
}
