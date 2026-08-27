'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Enrollment, Profile, EnrollmentStatus } from '@/types/crm'
import { ENROLLMENT_STATUS_COLORS } from '@/types/crm'
import { KanbanCard } from './KanbanCard'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
  status: EnrollmentStatus
  enrollments: Enrollment[]
  profiles: Map<string, Profile>
  onOpenProfile: (enrollment: Enrollment) => void
}

export function KanbanColumn({ status, enrollments, profiles, onOpenProfile }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  const badgeClass = ENROLLMENT_STATUS_COLORS[status]

  return (
    <div className="flex flex-col min-w-56 w-56 flex-shrink-0">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', badgeClass)}>
          {status}
        </span>
        <span className="text-xs text-gray-400 font-medium">{enrollments.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-xl p-2 space-y-2 min-h-24 transition-colors',
          isOver ? 'bg-blue-50 ring-2 ring-blue-200' : 'bg-gray-50'
        )}
      >
        <SortableContext
          items={enrollments.map(e => e.id)}
          strategy={verticalListSortingStrategy}
        >
          {enrollments.map(enrollment => (
            <KanbanCard
              key={enrollment.id}
              enrollment={enrollment}
              profile={profiles.get(enrollment.profileId)}
              onOpen={() => onOpenProfile(enrollment)}
            />
          ))}
        </SortableContext>

        {enrollments.length === 0 && (
          <div className="h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
            <span className="text-xs text-gray-300">גרור לכאן</span>
          </div>
        )}
      </div>
    </div>
  )
}
