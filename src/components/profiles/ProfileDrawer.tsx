'use client'

import { useEffect, useState } from 'react'
import { getEnrollmentsByProfile } from '@/lib/firestore'
import type { Profile, Enrollment } from '@/types/crm'
import { ENROLLMENT_STATUS_COLORS } from '@/types/crm'
import {
  CommunityStatusBadge,
  EngagementBadge,
  SectorBadge,
} from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { X, Pencil, Phone, Mail, Building2, MapPin, Linkedin, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatEngagementScore } from '@/lib/utils'

interface ProfileDrawerProps {
  profile: Profile
  onClose: () => void
  onEdit: () => void
}

type Tab = 'info' | 'enrollments'

export function ProfileDrawer({ profile, onClose, onEdit }: ProfileDrawerProps) {
  const [tab, setTab] = useState<Tab>('info')
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)
  const [expandedEnrollment, setExpandedEnrollment] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'enrollments') {
      setLoadingEnrollments(true)
      getEnrollmentsByProfile(profile.id).then(data => {
        setEnrollments(data)
        setLoadingEnrollments(false)
      })
    }
  }, [tab, profile.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const initials = `${profile.firstName?.charAt(0) ?? ''}${profile.lastName?.charAt(0) ?? ''}`

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 start-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-start gap-4 p-5 border-b border-gray-100">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 text-xl font-bold flex items-center justify-center flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 leading-tight">
              {profile.firstName} {profile.lastName}
            </h2>
            {profile.role && (
              <p className="text-sm text-gray-500 truncate">{profile.role}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <CommunityStatusBadge status={profile.communityStatus} />
              <EngagementBadge level={profile.engagementLevel} />
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              title="עריכה"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              title="סגור"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-gray-100">
          {([
            { id: 'info', label: 'פרטים אישיים' },
            { id: 'enrollments', label: 'השתתפות בתוכניות' },
          ] as { id: Tab; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 py-2.5 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'info' && (
            <div className="p-5 space-y-5">
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  פרטי קשר
                </h3>
                <div className="space-y-2">
                  {profile.phone && (
                    <InfoRow icon={<Phone className="w-4 h-4" />} label="טלפון">
                      <a href={`tel:${profile.phone}`} className="text-blue-600 hover:underline text-sm">
                        {profile.phone}
                      </a>
                    </InfoRow>
                  )}
                  {profile.email && (
                    <InfoRow icon={<Mail className="w-4 h-4" />} label="אימייל">
                      <a href={`mailto:${profile.email}`} className="text-blue-600 hover:underline text-sm truncate">
                        {profile.email}
                      </a>
                    </InfoRow>
                  )}
                  {profile.linkedinUrl && (
                    <InfoRow icon={<Linkedin className="w-4 h-4" />} label="LinkedIn">
                      <a
                        href={profile.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        פרופיל LinkedIn
                      </a>
                    </InfoRow>
                  )}
                  {profile.city && (
                    <InfoRow icon={<MapPin className="w-4 h-4" />} label="מיקום">
                      <span className="text-sm text-gray-700">
                        {profile.city}{profile.district ? ` · ${profile.district}` : ''}
                      </span>
                    </InfoRow>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  ארגון ותפקיד
                </h3>
                <div className="space-y-2">
                  {profile.organizationName && (
                    <InfoRow icon={<Building2 className="w-4 h-4" />} label="ארגון">
                      <span className="text-sm text-gray-700">{profile.organizationName}</span>
                    </InfoRow>
                  )}
                  {profile.role && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">תפקיד</span>
                      <span className="text-sm text-gray-700">{profile.role}</span>
                    </div>
                  )}
                  {profile.hierarchyLevel && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">דרג</span>
                      <span className="text-sm text-gray-700">{profile.hierarchyLevel}</span>
                    </div>
                  )}
                  {profile.currentSector && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-20 flex-shrink-0">מגזר</span>
                      <SectorBadge sector={profile.currentSector} />
                    </div>
                  )}
                </div>
              </section>

              {((profile.professionalExpertise?.length ?? 0) > 0 ||
                (profile.contentExpertise?.length ?? 0) > 0) && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    מומחיות
                  </h3>
                  {profile.professionalExpertise && profile.professionalExpertise.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-400 mb-1.5">מקצועית</p>
                      <div className="flex flex-wrap gap-1">
                        {profile.professionalExpertise.map(e => (
                          <span key={e} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.contentExpertise && profile.contentExpertise.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">תוכן</p>
                      <div className="flex flex-wrap gap-1">
                        {profile.contentExpertise.map(e => (
                          <span key={e} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {profile.engagementScore !== undefined && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    מעורבות
                  </h3>
                  <div className="flex items-center gap-3">
                    <EngagementBadge level={profile.engagementLevel} />
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(profile.engagementScore ?? 0) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-10 text-start">
                      {formatEngagementScore(profile.engagementScore)}
                    </span>
                  </div>
                </section>
              )}

              {profile.internalNotes && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    הערות פנימיות
                  </h3>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
                    {profile.internalNotes}
                  </p>
                </section>
              )}
            </div>
          )}

          {tab === 'enrollments' && (
            <div className="p-5">
              {loadingEnrollments ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : enrollments.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">אין רשומות השתתפות</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {enrollments.map(enrollment => (
                    <EnrollmentCard
                      key={enrollment.id}
                      enrollment={enrollment}
                      expanded={expandedEnrollment === enrollment.id}
                      onToggle={() =>
                        setExpandedEnrollment(
                          expandedEnrollment === enrollment.id ? null : enrollment.id
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-gray-100">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
            סגור
          </Button>
          <Button size="sm" icon={<Pencil className="w-3.5 h-3.5" />} onClick={onEdit} className="flex-1">
            עריכה
          </Button>
        </div>
      </div>
    </>
  )
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-300 flex-shrink-0">{icon}</span>
      <span className="text-xs text-gray-400 w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function EnrollmentCard({
  enrollment,
  expanded,
  onToggle,
}: {
  enrollment: Enrollment
  expanded: boolean
  onToggle: () => void
}) {
  const statusColor = ENROLLMENT_STATUS_COLORS[enrollment.status] ?? 'bg-gray-100 text-gray-600'

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-start hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColor)}>
            {enrollment.status}
          </span>
          <span className="text-sm text-gray-700">
            {enrollment.cohortLabel ? `מחזור ${enrollment.cohortLabel}` : ''}{' '}
            {enrollment.cohortYear ? `(${enrollment.cohortYear})` : ''}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && enrollment.statusHistory.length > 0 && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 mt-2 mb-2">היסטוריית סטטוסים</p>
          <div className="space-y-1.5">
            {enrollment.statusHistory.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                <span className={cn('px-1.5 py-0.5 rounded text-xs', ENROLLMENT_STATUS_COLORS[entry.from])}>
                  {entry.from}
                </span>
                <span className="text-gray-400">→</span>
                <span className={cn('px-1.5 py-0.5 rounded text-xs', ENROLLMENT_STATUS_COLORS[entry.to])}>
                  {entry.to}
                </span>
              </div>
            ))}
          </div>
          {enrollment.notes && (
            <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded p-2">{enrollment.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}
