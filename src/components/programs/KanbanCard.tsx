'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Enrollment, Profile } from '@/types/crm'
import { SectorBadge } from '@/components/ui/Badge'
import { GripVertical, Phone } from 'lucide-react'

interface KanbanCardProps {
  enrollment: Enrollment
  profile: Profile | undefined
  onOpen: () => void
}

export function KanbanCard({ enrollment, profile, onOpen }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: enrollment.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const initials = profile
    ? `${profile.firstName?.charAt(0) ?? ''}${profile.lastName?.charAt(0) ?? ''}`
    : '?'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-default"
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <button
            onClick={onOpen}
            className="flex items-center gap-2 hover:text-blue-600 text-start w-full"
          >
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {profile ? `${profile.firstName} ${profile.lastName}` : enrollment.profileId}
              </p>
              {profile?.role && (
                <p className="text-xs text-gray-400 truncate">{profile.role}</p>
              )}
            </div>
          </button>

          {(profile?.organizationName || profile?.currentSector) && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {profile?.currentSector && <SectorBadge sector={profile.currentSector} />}
              {profile?.organizationName && (
                <span className="text-xs text-gray-400 truncate max-w-28">{profile.organizationName}</span>
              )}
            </div>
          )}

          {profile?.phone && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
              <Phone className="w-3 h-3" />
              <span>{profile.phone}</span>
            </div>
          )}

          {enrollment.notes && (
            <p className="mt-1.5 text-xs text-gray-400 italic truncate">{enrollment.notes}</p>
          )}
        </div>
      </div>
    </div>
  )
}
