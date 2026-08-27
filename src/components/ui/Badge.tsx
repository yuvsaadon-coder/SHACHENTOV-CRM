import { cn } from '@/lib/utils'
import type {
  CommunityStatus,
  EnrollmentStatus,
  EngagementLevel,
  SectorType,
} from '@/types/crm'
import {
  COMMUNITY_STATUS_COLORS,
  ENROLLMENT_STATUS_COLORS,
  ENGAGEMENT_LEVEL_COLORS,
  SECTOR_COLORS,
} from '@/types/crm'

interface BadgeProps {
  className?: string
  children: React.ReactNode
}

export function Badge({ className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        className
      )}
    >
      {children}
    </span>
  )
}

export function CommunityStatusBadge({ status }: { status?: CommunityStatus }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  return <Badge className={COMMUNITY_STATUS_COLORS[status]}>{status}</Badge>
}

export function EnrollmentStatusBadge({ status }: { status?: EnrollmentStatus }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  return <Badge className={ENROLLMENT_STATUS_COLORS[status]}>{status}</Badge>
}

export function EngagementBadge({ level }: { level?: EngagementLevel }) {
  if (!level) return <span className="text-gray-400 text-xs">—</span>
  return <Badge className={ENGAGEMENT_LEVEL_COLORS[level]}>{level}</Badge>
}

export function SectorBadge({ sector }: { sector?: SectorType }) {
  if (!sector) return <span className="text-gray-400 text-xs">—</span>
  return <Badge className={SECTOR_COLORS[sector]}>{sector}</Badge>
}
