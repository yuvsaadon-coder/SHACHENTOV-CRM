'use client'

import { useEffect, useState } from 'react'
import { getAllProfiles, getSegments, getBroadcasts } from '@/lib/firestore'
import type { Profile, Segment, BroadcastLog } from '@/types/crm'
import { BROADCAST_CHANNEL_LABELS } from '@/types/crm'
import { BroadcastComposer } from '@/components/broadcasts/BroadcastComposer'

export default function BroadcastsPage() {
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [broadcasts, setBroadcasts] = useState<BroadcastLog[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [profiles, segs, bcs] = await Promise.all([
      getAllProfiles(),
      getSegments(),
      getBroadcasts(),
    ])
    setAllProfiles(profiles)
    setSegments(segs)
    setBroadcasts(bcs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">שליחת הודעות</h1>
        <p className="text-sm text-gray-500 mt-0.5">שליחת הודעות לקהלים שמורים</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Composer */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">הרכבת הודעה</h2>
          {loading ? (
            <div className="h-64 bg-gray-100 rounded animate-pulse" />
          ) : segments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">אין קהלים שמורים.</p>
              <p className="text-xs mt-1">צור קהל בדף הפילוח ואז חזור לכאן.</p>
            </div>
          ) : (
            <BroadcastComposer
              segments={segments}
              allProfiles={allProfiles}
              onSent={() => getBroadcasts().then(setBroadcasts)}
            />
          )}
        </div>

        {/* History */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">היסטוריית שליחות</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              אין שליחות עדיין
            </div>
          ) : (
            <div className="space-y-3">
              {broadcasts.map(bc => (
                <div key={bc.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">
                      {BROADCAST_CHANNEL_LABELS[bc.channel]}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      bc.status === 'simulated' ? 'bg-amber-100 text-amber-700' :
                      bc.status === 'sent' ? 'bg-green-100 text-green-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {bc.status === 'simulated' ? 'סימולציה' : bc.status === 'sent' ? 'נשלח' : 'נכשל'}
                    </span>
                  </div>
                  {bc.segmentName && (
                    <p className="text-xs text-gray-400">קהל: {bc.segmentName}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1 truncate">{bc.templateBody}</p>
                  <p className="text-xs text-gray-400 mt-1">{bc.recipientCount} נמענים</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
