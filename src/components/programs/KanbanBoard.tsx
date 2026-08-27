'use client'

import { useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import type { Enrollment, Profile, EnrollmentStatus } from '@/types/crm'
import { ENROLLMENT_STATUS_LABELS } from '@/types/crm'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { updateEnrollment } from '@/lib/firestore'
import { useAuth } from '@/context/AuthContext'

const PIPELINE_ORDER: EnrollmentStatus[] = [
  'מועמד', 'במיון', 'ראיון', 'התקבל', 'פעיל', 'בוגר', 'נשר',
]

interface KanbanBoardProps {
  enrollments: Enrollment[]
  profiles: Map<string, Profile>
  onEnrollmentUpdated: (updated: Enrollment) => void
  onOpenProfile: (enrollment: Enrollment) => void
}

export function KanbanBoard({ enrollments, profiles, onEnrollmentUpdated, onOpenProfile }: KanbanBoardProps) {
  const { appUser } = useAuth()
  const [localEnrollments, setLocalEnrollments] = useState<Enrollment[]>(enrollments)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const grouped = PIPELINE_ORDER.reduce<Record<EnrollmentStatus, Enrollment[]>>(
    (acc, status) => {
      acc[status] = localEnrollments.filter(e => e.status === status)
      return acc
    },
    {} as Record<EnrollmentStatus, Enrollment[]>
  )

  const activeEnrollment = activeId ? localEnrollments.find(e => e.id === activeId) : null

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const enrollment = localEnrollments.find(e => e.id === active.id)
    if (!enrollment) return

    let newStatus: EnrollmentStatus | undefined

    if (PIPELINE_ORDER.includes(over.id as EnrollmentStatus)) {
      newStatus = over.id as EnrollmentStatus
    } else {
      const overEnrollment = localEnrollments.find(e => e.id === over.id)
      newStatus = overEnrollment?.status
    }

    if (!newStatus || newStatus === enrollment.status) return

    const now = new Date()
    const historyEntry = {
      from: enrollment.status,
      to: newStatus,
      changedAt: { toDate: () => now } as any,
      changedBy: appUser?.uid ?? 'unknown',
    }

    const updated: Enrollment = {
      ...enrollment,
      status: newStatus,
      statusHistory: [...enrollment.statusHistory, historyEntry],
      updatedAt: { toDate: () => now } as any,
    }

    setLocalEnrollments(prev => prev.map(e => e.id === enrollment.id ? updated : e))
    onEnrollmentUpdated(updated)

    updateEnrollment(enrollment.id, {
      status: newStatus,
      statusHistory: updated.statusHistory,
    }).catch(() => {
      setLocalEnrollments(prev => prev.map(e => e.id === enrollment.id ? enrollment : e))
    })
  }

  if (JSON.stringify(enrollments.map(e => e.id)) !== JSON.stringify(localEnrollments.map(e => e.id))) {
    setLocalEnrollments(enrollments)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={e => setActiveId(e.active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_ORDER.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            enrollments={grouped[status]}
            profiles={profiles}
            onOpenProfile={onOpenProfile}
          />
        ))}
      </div>

      <DragOverlay>
        {activeEnrollment && (
          <KanbanCard
            enrollment={activeEnrollment}
            profile={profiles.get(activeEnrollment.profileId)}
            onOpen={() => {}}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
