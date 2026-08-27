'use client'

import { useEffect, useState, useMemo } from 'react'
import { getAllProfiles, getSegments, createSegment, evaluateSegmentQuery } from '@/lib/firestore'
import type { Profile, Segment, SegmentQuery } from '@/types/crm'
import { useAuth } from '@/context/AuthContext'
import { SegmentBuilder } from '@/components/segments/SegmentBuilder'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CommunityStatusBadge, EngagementBadge, SectorBadge } from '@/components/ui/Badge'
import { Download, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { exportProfilesToXlsx } from '@/lib/export'

function emptyQuery(): SegmentQuery {
  return { logicalOperator: 'AND', conditions: [], groups: [] }
}

export default function SegmentsPage() {
  const { appUser } = useAuth()
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [savedSegments, setSavedSegments] = useState<Segment[]>([])
  const [query, setQuery] = useState<SegmentQuery>(emptyQuery())
  const [segmentName, setSegmentName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    Promise.all([getAllProfiles(), getSegments()]).then(([profiles, segments]) => {
      setAllProfiles(profiles)
      setSavedSegments(segments)
      setLoading(false)
    })
  }, [])

  const results = useMemo(
    () => evaluateSegmentQuery(allProfiles, query),
    [allProfiles, query]
  )

  async function handleSave() {
    if (!segmentName.trim() || !appUser) return
    setSaving(true)
    const id = await createSegment({
      name: segmentName.trim(),
      query,
      lastResultCount: results.length,
      createdBy: appUser.uid,
    })
    setSavedSegments(prev => [...prev, {
      id,
      name: segmentName.trim(),
      query,
      lastResultCount: results.length,
      createdBy: appUser.uid,
      createdAt: new Date() as any,
      updatedAt: new Date() as any,
    }])
    setSegmentName('')
    setSaving(false)
  }

  function loadSegment(segment: Segment) {
    setQuery(segment.query)
    setSegmentName(segment.name)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">פילוח קהלים</h1>
        <p className="text-sm text-gray-500 mt-0.5">בניית קהלים לייצוא ושליחה</p>
      </div>

      {/* Saved segments toggle */}
      {savedSegments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-700"
          >
            <span>קהלים שמורים ({savedSegments.length})</span>
            {showSaved ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showSaved && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {savedSegments.map(seg => (
                <div key={seg.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{seg.name}</p>
                    {seg.lastResultCount !== undefined && (
                      <p className="text-xs text-gray-400">{seg.lastResultCount} פרופילים</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => loadSegment(seg)}>
                    טעינה
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Builder */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">בניית קהל</h2>
        {loading ? (
          <div className="h-20 bg-gray-100 rounded animate-pulse" />
        ) : (
          <SegmentBuilder
            query={query}
            onChange={setQuery}
            resultCount={results.length}
          />
        )}
      </div>

      {/* Save + export row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={segmentName}
          onChange={e => setSegmentName(e.target.value)}
          placeholder="שם קהל לשמירה..."
          className="max-w-56"
        />
        <Button
          size="sm"
          variant="outline"
          icon={<Save className="w-3.5 h-3.5" />}
          onClick={handleSave}
          loading={saving}
          disabled={!segmentName.trim() || results.length === 0}
        >
          שמור קהל
        </Button>
        <Button
          size="sm"
          icon={<Download className="w-3.5 h-3.5" />}
          onClick={() => exportProfilesToXlsx(results)}
          disabled={results.length === 0}
        >
          ייצוא Excel ({results.length})
        </Button>
      </div>

      {/* Results table */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-medium text-gray-700">
              תוצאות: <span className="text-blue-600 font-bold">{results.length}</span> פרופילים
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>ארגון</th>
                  <th>מגזר</th>
                  <th>סטטוס</th>
                  <th>מעורבות</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 100).map(profile => (
                  <tr key={profile.id}>
                    <td>
                      <div className="text-sm font-medium text-gray-900">
                        {profile.firstName} {profile.lastName}
                      </div>
                      {profile.email && <div className="text-xs text-gray-400">{profile.email}</div>}
                    </td>
                    <td className="text-sm text-gray-600">{profile.organizationName ?? '—'}</td>
                    <td><SectorBadge sector={profile.currentSector} /></td>
                    <td><CommunityStatusBadge status={profile.communityStatus} /></td>
                    <td><EngagementBadge level={profile.engagementLevel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length > 100 && (
              <p className="px-5 py-3 text-xs text-gray-400 text-center border-t border-gray-100">
                מוצגים 100 מתוך {results.length} תוצאות. ייצא ל-Excel לצפייה בכולם.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
