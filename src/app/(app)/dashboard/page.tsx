'use client'

import { useEffect, useState } from 'react'
import { getAllProfiles } from '@/lib/firestore'
import type { Profile } from '@/types/crm'
import { Users, UserCheck, TrendingUp, Building2 } from 'lucide-react'
import { EngagementBadge, SectorBadge } from '@/components/ui/Badge'
import Link from 'next/link'

export default function DashboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllProfiles().then(data => {
      setProfiles(data)
      setLoading(false)
    })
  }, [])

  // Derived stats
  const totalProfiles = profiles.length
  const activeMembers = profiles.filter(p => p.communityStatus === 'חבר קהילה' || p.communityStatus === 'משתתף').length
  const highEngagement = profiles.filter(p => p.engagementLevel === 'גבוהה').length
  const publicSector = profiles.filter(p => p.inPublicSector === true).length

  // Sector breakdown
  const sectorCounts: Record<string, number> = {}
  profiles.forEach(p => {
    if (p.currentSector) {
      sectorCounts[p.currentSector] = (sectorCounts[p.currentSector] ?? 0) + 1
    }
  })

  // Engagement breakdown
  const engagementCounts: Record<string, number> = {}
  profiles.forEach(p => {
    if (p.engagementLevel) {
      engagementCounts[p.engagementLevel] = (engagementCounts[p.engagementLevel] ?? 0) + 1
    }
  })

  // Recent profiles (last 8)
  const recentProfiles = profiles.slice(0, 8)

  const stats = [
    {
      label: 'סה"כ פרופילים',
      value: totalProfiles,
      icon: <Users className="w-6 h-6" />,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'חברי קהילה פעילים',
      value: activeMembers,
      icon: <UserCheck className="w-6 h-6" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'מעורבות גבוהה',
      value: highEngagement,
      icon: <TrendingUp className="w-6 h-6" />,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'מגזר ציבורי',
      value: publicSector,
      icon: <Building2 className="w-6 h-6" />,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">דשבורד</h1>
        <p className="text-sm text-gray-500 mt-0.5">סקירת מצב קהילת הבוגרים</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900">
                  {loading ? '—' : stat.value.toLocaleString('he-IL')}
                </p>
              </div>
              <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sector breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">פיזור לפי מגזר</h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(sectorCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([sector, count]) => (
                  <div key={sector} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-gray-600 flex-shrink-0">{sector}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{
                          width: `${Math.min(100, (count / totalProfiles) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-8 text-start">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Engagement breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">רמות מעורבות</h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {['גבוהה', 'בינונית', 'נמוכה', 'ללא מעורבות', 'טרם רלוונטי'].map(level => {
                const count = engagementCounts[level] ?? 0
                return (
                  <div key={level} className="flex items-center justify-between">
                    <EngagementBadge level={level as any} />
                    <span className="text-sm font-semibold text-gray-700">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent profiles */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">פרופילים אחרונים</h2>
          <Link href="/profiles" className="text-sm text-blue-600 hover:underline">
            כל הפרופילים
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {loading
            ? Array(5).fill(0).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-8 h-8 bg-gray-100 rounded-full animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded w-32 animate-pulse" />
                    <div className="h-2 bg-gray-100 rounded w-48 animate-pulse" />
                  </div>
                </div>
              ))
            : recentProfiles.map(profile => (
                <Link
                  key={profile.id}
                  href={`/profiles/${profile.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm flex items-center justify-center flex-shrink-0">
                    {profile.firstName?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {profile.firstName} {profile.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {profile.role}{profile.organizationName ? ` | ${profile.organizationName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {profile.currentSector && (
                      <SectorBadge sector={profile.currentSector} />
                    )}
                    <EngagementBadge level={profile.engagementLevel} />
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </div>
  )
}
