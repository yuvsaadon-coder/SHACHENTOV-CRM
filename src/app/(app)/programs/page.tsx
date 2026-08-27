'use client'

import { useEffect, useState } from 'react'
import { getPrograms, getCohorts, getEnrollmentsByCohort } from '@/lib/firestore'
import type { Program, Cohort } from '@/types/crm'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { LayoutGrid } from 'lucide-react'
import Link from 'next/link'

interface ProgramWithStats {
  program: Program
  cohorts: Cohort[]
  totalEnrollments: number
}

export default function ProgramsPage() {
  const { appUser, isSuperAdmin } = useAuth()
  const [items, setItems] = useState<ProgramWithStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const programs = await getPrograms()
      const filtered = isSuperAdmin
        ? programs
        : programs.filter(p => appUser?.assignedProgramIds.includes(p.id))

      const withStats = await Promise.all(
        filtered.map(async program => {
          const cohorts = await getCohorts(program.id)
          // Count enrollments across all cohorts
          const enrollmentCounts = await Promise.all(
            cohorts.map(c => getEnrollmentsByCohort(c.id).then(e => e.length))
          )
          return {
            program,
            cohorts,
            totalEnrollments: enrollmentCounts.reduce((a, b) => a + b, 0),
          }
        })
      )
      setItems(withStats)
      setLoading(false)
    }
    load()
  }, [isSuperAdmin, appUser])

  const PROGRAM_COLOR: Record<string, string> = {
    'ממשלתי': 'from-blue-500 to-blue-600',
    'מוניציפלי': 'from-teal-500 to-teal-600',
    'אכיפת החוק': 'from-violet-500 to-violet-600',
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">תוכניות</h1>
        <p className="text-sm text-gray-500 mt-0.5">ניהול תוכניות מחזורים ופיפליין מועמדים</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-52 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map(({ program, cohorts, totalEnrollments }) => {
            const gradient = PROGRAM_COLOR[program.name] ?? 'from-gray-500 to-gray-600'
            const activeCohort = cohorts.find(c => c.isActive)
            return (
              <div
                key={program.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className={`bg-gradient-to-br ${gradient} p-5`}>
                  <h2 className="text-xl font-bold text-white">{program.title}</h2>
                  <p className="text-white/80 text-sm mt-0.5">{program.name}</p>
                </div>
                <div className="p-5 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="מחזורים" value={cohorts.length} />
                    <Stat label="סהִִכ משתתפים" value={totalEnrollments} />
                  </div>
                  {activeCohort && (
                    <p className="text-xs text-gray-400">
                      מחזור פעיל: מחזור {activeCohort.label} ({activeCohort.year})
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Link href={`/programs/${program.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        סקירה
                      </Button>
                    </Link>
                    {activeCohort && (
                      <Link href={`/programs/${program.id}/kanban?cohortId=${activeCohort.id}`} className="flex-1">
                        <Button size="sm" icon={<LayoutGrid className="w-3.5 h-3.5" />} className="w-full">
                          פיפליין
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
