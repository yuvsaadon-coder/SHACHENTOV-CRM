'use client'

import { useEffect, useState } from 'react'
import { getProfile, getEnrollmentsByProfile } from '@/lib/firestore'
import type { Profile, Enrollment } from '@/types/crm'
import { ENROLLMENT_STATUS_COLORS } from '@/types/crm'
import { CommunityStatusBadge, EngagementBadge, SectorBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ProfileForm } from '@/components/profiles/ProfileForm'
import { ArrowRight, Pencil, Phone, Mail, MapPin, Building2, Linkedin } from 'lucide-react'
import { cn, formatEngagementScore } from '@/lib/utils'
import Link from 'next/link'
import { use } from 'react'

export default function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const [p, e] = await Promise.all([getProfile(id), getEnrollmentsByProfile(id)])
    setProfile(p)
    setEnrollments(e)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>הפרופיל לא נמצא</p>
        <Link href="/profiles" className="text-blue-600 hover:underline text-sm mt-2 block">
          חזרה לרשימה
        </Link>
      </div>
    )
  }

  const initials = `${profile.firstName?.charAt(0) ?? ''}${profile.lastName?.charAt(0) ?? ''}`

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/profiles" className="hover:text-blue-600 flex items-center gap-1">
          <ArrowRight className="w-3.5 h-3.5" />
          פרופילים
        </Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{profile.firstName} {profile.lastName}</span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-start gap-5">
        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 text-2xl font-bold flex items-center justify-center flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            {profile.firstName} {profile.lastName}
          </h1>
          {profile.role && (
            <p className="text-gray-500 mt-0.5">{profile.role}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <CommunityStatusBadge status={profile.communityStatus} />
            <EngagementBadge level={profile.engagementLevel} />
            {profile.currentSector && <SectorBadge sector={profile.currentSector} />}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          icon={<Pencil className="w-3.5 h-3.5" />}
          onClick={() => setShowForm(true)}
        >
          עריכה
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Contact & Organization */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">פרטי קשר וארגון</h2>
          <div className="space-y-2.5">
            {profile.phone && (
              <Row icon={<Phone className="w-4 h-4 text-gray-300" />} label="טלפון">
                <a href={`tel:${profile.phone}`} className="text-blue-600 hover:underline text-sm">{profile.phone}</a>
              </Row>
            )}
            {profile.email && (
              <Row icon={<Mail className="w-4 h-4 text-gray-300" />} label="אימייל">
                <a href={`mailto:${profile.email}`} className="text-blue-600 hover:underline text-sm">{profile.email}</a>
              </Row>
            )}
            {profile.linkedinUrl && (
              <Row icon={<Linkedin className="w-4 h-4 text-gray-300" />} label="LinkedIn">
                <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                  פרופיל LinkedIn
                </a>
              </Row>
            )}
            {profile.city && (
              <Row icon={<MapPin className="w-4 h-4 text-gray-300" />} label="מיקום">
                <span className="text-sm text-gray-700">{profile.city}{profile.district ? ` · ${profile.district}` : ''}</span>
              </Row>
            )}
            {profile.organizationName && (
              <Row icon={<Building2 className="w-4 h-4 text-gray-300" />} label="ארגון">
                <span className="text-sm text-gray-700">{profile.organizationName}</span>
              </Row>
            )}
            {profile.hierarchyLevel && (
              <Row icon={null} label="דרג">
                <span className="text-sm text-gray-700">{profile.hierarchyLevel}</span>
              </Row>
            )}
          </div>
        </div>

        {/* Expertise + Engagement */}
        <div className="space-y-4">
          {((profile.professionalExpertise?.length ?? 0) > 0 || (profile.contentExpertise?.length ?? 0) > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-3">מומחיות</h2>
              {profile.professionalExpertise && profile.professionalExpertise.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1.5">מקצועית</p>
                  <div className="flex flex-wrap gap-1">
                    {profile.professionalExpertise.map(e => (
                      <span key={e} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{e}</span>
                    ))}
                  </div>
                </div>
              )}
              {profile.contentExpertise && profile.contentExpertise.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">תוכן</p>
                  <div className="flex flex-wrap gap-1">
                    {profile.contentExpertise.map(e => (
                      <span key={e} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">{e}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {profile.engagementScore !== undefined && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-3">מעורבות</h2>
              <div className="flex items-center gap-3">
                <EngagementBadge level={profile.engagementLevel} />
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${(profile.engagementScore ?? 0) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{formatEngagementScore(profile.engagementScore)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enrollments */}
      {enrollments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">השתתפות בתוכניות</h2>
          <div className="space-y-3">
            {enrollments.map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ENROLLMENT_STATUS_COLORS[e.status])}>
                    {e.status}
                  </span>
                  <span className="text-sm text-gray-700">
                    {e.cohortLabel ? `מחזור ${e.cohortLabel}` : ''}{e.cohortYear ? ` (${e.cohortYear})` : ''}
                  </span>
                </div>
                {e.notes && <span className="text-xs text-gray-400 truncate max-w-48">{e.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.internalNotes && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-2">הערות פנימיות</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{profile.internalNotes}</p>
        </div>
      )}

      {showForm && (
        <ProfileForm
          profile={profile}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-shrink-0 w-5">{icon}</span>
      <span className="text-xs text-gray-400 w-14 flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
