'use client'

import { useEffect, useState, useMemo } from 'react'
import { getPrograms, getCohorts, getEnrollmentsByCohort, getAllProfiles } from '@/lib/firestore'
import type { Program, Cohort, Enrollment, Profile } from '@/types/crm'
import { KanbanBoard } from '@/components/programs/KanbanBoard'
import { ProfileDrawer } from '@/components/profiles/ProfileDrawer'
import { ProfileForm } from '@/components/profiles/ProfileForm'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { ArrowRight, LayoutGrid, Table2 } from 'lucide-react'
import { ENROLLMENT_STATUS_COLORS } from '@/types/crm'
import Link from 'next/link'
import { use } from 'react'
import { cn } from '@/lib/utils'

export default function KanbanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cohortId?: string }>
}) {
  const { id } = use(params)
  const sp = use(searchParams)

  const [program, setProgram] = useState<Program | null>(null)
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [selectedCohortId, setSelectedCohortId] = useState<string>(sp.cohortId ?? '')
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map())
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null)
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    async function load() {
      const [programs, allProfiles] = await Promise.all([getPrograms(), getAllProfiles()])
      const p = programs.find(pr => pr.id === id) ?? null
      setProgram(p)

      const profileMap = new Map(allProfiles.map(p => [p.id, p]))
      setProfiles(profileMap)

      if (p) {
        const c = await getCohorts(p.id)
        setCohorts(c)
        const cohortId = selectedCohortId || c.find(c => c.isActive)?.id || c[0]?.id || ''
        setSelectedCohortId(cohortId)
        if (cohortId) {
          const e = await getEnrollmentsByCohort(cohortId)
          setEnrollments(e)
        }
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function loadEnrollments(cohortId: string) {
    setLoading(true)
    setEnrollments(await getEnrollmentsByCohort(cohortId))
    setLoading(false)
  }

  const selectedProfile = selectedEnrollment ? profiles.get(selectedEnrollment.profileId) ?? null : null
  const selectedCohort = cohorts.find(c => c.id === selectedCohortId)

  if (!program && !loading) {
    return <div className="text-center py-20 text-gray-400">התוכנית לא נמצאה</div>
  }

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/programs" className="hover:text-blue-600 flex items-center gap-1">
            <ArrowRight className="w-3.5 h-3.5" />
            תוכניות
          </Link>
          <span>/</span>
          <Link href={`/programs/${id}`} className="hover:text-blue-600">
            {program?.title ?? '...'}
          </Link>
          <span>/</span>
          <span className="text-gray-800">פיפליין</span>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              פיפליין מועמדים — {program?.title}
            </h1>
            {selectedCohort && (
              <p className="text-sm text-gray-400 mt-0.5">
                מחזור {selectedCohort.label} ({selectedCohort.year}) · {enrollments.length} רשומות
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Cohort selector */}
            <Select
              value={selectedCohortId}
              onChange={e => {
                setSelectedCohortId(e.target.value)
                loadEnrollments(e.target.value)
              }}
              className="h-8 text-xs"
            >
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>
                  מחזור {c.label} ({c.year}){c.isActive ? ' ✓' : ''}
                </option>
              ))}
            </Select>

            {/* View toggle */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('kanban')}
                className={cn(
                  'px-2.5 py-1.5 transition-colors',
                  viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                )}
                title="תצוגת קנבן"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  'px-2.5 py-1.5 border-s border-gray-200 transition-colors',
                  viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                )}
                title="תצוגת טבלה"
              >
                <Table2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex gap-3 overflow-x-auto">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="w-56 flex-shrink-0 h-64 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="flex-1 overflow-auto">
          <KanbanBoard
            enrollments={enrollments}
            profiles={profiles}
            onEnrollmentUpdated={updated =>
              setEnrollments(prev => prev.map(e => e.id === updated.id ? updated : e))
            }
            onOpenProfile={enrollment => setSelectedEnrollment(enrollment)}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>שם</th>
                <th>ארגון</th>
                <th>סטטוס</th>
                <th>הערות</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map(enrollment => {
                const profile = profiles.get(enrollment.profileId)
                return (
                  <tr key={enrollment.id}>
                    <td>
                      <button
                        onClick={() => setSelectedEnrollment(enrollment)}
                        className="text-sm font-medium text-blue-600 hover:underline text-start"
                      >
                        {profile ? `${profile.firstName} ${profile.lastName}` : enrollment.profileId}
                      </button>
                    </td>
                    <td>
                      <span className="text-sm text-gray-600">{profile?.organizationName ?? '—'}</span>
                    </td>
                    <td>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ENROLLMENT_STATUS_COLORS[enrollment.status])}>
                        {enrollment.status}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-gray-400 truncate max-w-40 block">{enrollment.notes ?? '—'}</span>
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          const p = profiles.get(enrollment.profileId)
                          if (p) { setEditProfile(p); setShowForm(true) }
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        עריכה
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Profile drawer */}
      {selectedEnrollment && selectedProfile && (
        <ProfileDrawer
          profile={selectedProfile}
          onClose={() => setSelectedEnrollment(null)}
          onEdit={() => {
            setEditProfile(selectedProfile)
            setShowForm(true)
            setSelectedEnrollment(null)
          }}
        />
      )}

      {/* Edit form */}
      {showForm && (
        <ProfileForm
          profile={editProfile}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            // Refresh profiles
            getAllProfiles().then(all => setProfiles(new Map(all.map(p => [p.id, p]))))
          }}
        />
      )}
    </div>
  )
}
