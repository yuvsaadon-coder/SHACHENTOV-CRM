'use client'

import { useEffect, useState } from 'react'
import { getPrograms, getCohorts, getEnrollmentsByCohort } from '@/lib/firestore'
import type { Program, Cohort, Enrollment, EnrollmentStatus } from '@/types/crm'
import { ENROLLMENT_STATUS_LABELS } from '@/types/crm'
import { Button } from '@/components/ui/Button'
import { LayoutGrid, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { use } from 'react'
import { cn } from '@/lib/utils'

const PIPELINE_ORDER: EnrollmentStatus[] = [
  'מועמד', 'במיון', 'ראיון', 'התקבל', 'פעיל', 'בוגר', 'נשר',
]

export default function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [program, setProgram] = useState<Program | null>(null)
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [cohortEnrollments, setCohortEnrollments] = useState<Record<string, Enrollment[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const programs = await getPrograms()
      const p = programs.find(pr => pr.id === id) ?? null
      setProgram(p)
      if (!p) { setLoading(false); return }

      const c = await getCohorts(p.id)
      setCohorts(c.sort((a, b) => b.year - a.year))

      const enrollmentMap: Record<string, Enrollment[]> = {}
      await Promise.all(
        c.map(async cohort => {
          enrollmentMap[cohort.id] = await getEnrollmentsByCohort(cohort.id)
        })
      )
      setCohortEnrollments(enrollmentMap)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (!program) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>התוכנית לא נמצאה</p>
        <Link href="/programs" className="text-blue-600 hover:underline text-sm mt-2 block">חזרה לתוכניות</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/programs" className="hover:text-blue-600 flex items-center gap-1">
          <ArrowRight className="w-3.5 h-3.5" />
          תוכניות
        </Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{program.title}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{program.title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{program.name}</p>
      </div>

      {cohorts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-sm">אין מחזורים בתוכנית זו</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cohorts.map(cohort => {
            const enrollments = cohortEnrollments[cohort.id] ?? []
            const statusCounts: Partial<Record<EnrollmentStatus, number>> = {}
            enrollments.forEach(e => {
              statusCounts[e.status] = (statusCounts[e.status] ?? 0) + 1
            })

            return (
              <div key={cohort.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-gray-900">
                        מחזור {cohort.label} — {cohort.year}
                      </h2>
                      {cohort.isActive && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          פעיל
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{enrollments.length} רשומות</p>
                  </div>
                  <Link href={`/programs/${id}/kanban?cohortId=${cohort.id}`}>
                    <Button size="sm" icon={<LayoutGrid className="w-3.5 h-3.5" />}>
                      פיפליין מועמדים
                    </Button>
                  </Link>
                </div>

                {/* Status funnel */}
                <div className="flex gap-2 flex-wrap">
                  {PIPELINE_ORDER.map(status => {
                    const count = statusCounts[status] ?? 0
                    const pct = enrollments.length > 0 ? (count / enrollments.length) * 100 : 0
                    return (
                      <div key={status} className="flex flex-col items-center gap-1 min-w-14">
                        <div className="relative w-full bg-gray-100 rounded h-16 flex items-end justify-center overflow-hidden">
                          <div
                            className="w-full bg-blue-400 rounded transition-all"
                            style={{ height: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700">{count}</span>
                        <span className="text-xs text-gray-400 text-center leading-tight">
                          {status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
