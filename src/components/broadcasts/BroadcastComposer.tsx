'use client'

import { useState } from 'react'
import type { Segment, BroadcastChannel, Profile } from '@/types/crm'
import { BROADCAST_CHANNEL_LABELS } from '@/types/crm'
import { evaluateSegmentQuery } from '@/lib/firestore'
import { applyMergeTags } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Send, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

const CHANNELS: BroadcastChannel[] = ['whatsapp', 'sms', 'email']

const MERGE_TAGS = [
  { tag: '{שם_פרטי}', label: 'שם פרטי' },
  { tag: '{שם_מלא}', label: 'שם מלא' },
  { tag: '{ארגון}', label: 'ארגון' },
]

interface BroadcastComposerProps {
  segments: Segment[]
  allProfiles: Profile[]
  onSent: () => void
}

export function BroadcastComposer({ segments, allProfiles, onSent }: BroadcastComposerProps) {
  const [channel, setChannel] = useState<BroadcastChannel>('whatsapp')
  const [segmentId, setSegmentId] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [sending, setSending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const selectedSegment = segments.find(s => s.id === segmentId)
  const recipients = selectedSegment
    ? evaluateSegmentQuery(allProfiles, selectedSegment.query)
    : []

  function insertTag(tag: string) {
    setTemplateBody(prev => prev + tag)
  }

  function getPreviewMessages(): string[] {
    return recipients.slice(0, 3).map(profile =>
      applyMergeTags(templateBody, {
        'שם_פרטי': profile.firstName,
        'שם_מלא': `${profile.firstName} ${profile.lastName}`.trim(),
        'ארגון': profile.organizationName ?? '',
      })
    )
  }

  async function handleSend() {
    if (!templateBody.trim() || !segmentId) return
    setSending(true)
    try {
      await fetch('/api/broadcasts/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          segmentId,
          segmentName: selectedSegment?.name,
          templateBody,
          recipientCount: recipients.length,
        }),
      })
      onSent()
      setTemplateBody('')
      setSegmentId('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Channel */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ערוץ</p>
        <div className="flex gap-2">
          {CHANNELS.map(ch => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                channel === ch
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              )}
            >
              {BROADCAST_CHANNEL_LABELS[ch]}
            </button>
          ))}
        </div>
      </div>

      {/* Segment */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">קהל</p>
        <select
          value={segmentId}
          onChange={e => setSegmentId(e.target.value)}
          className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">בחר קהל שמור...</option>
          {segments.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.lastResultCount ?? '?'} נמענים)
            </option>
          ))}
        </select>
        {segmentId && (
          <p className="text-xs text-gray-400 mt-1">
            {recipients.length} נמענים בקהל זה
          </p>
        )}
      </div>

      {/* Template */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">הודעה</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {MERGE_TAGS.map(t => (
            <button
              key={t.tag}
              type="button"
              onClick={() => insertTag(t.tag)}
              className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100"
            >
              + {t.label}
            </button>
          ))}
        </div>
        <textarea
          value={templateBody}
          onChange={e => setTemplateBody(e.target.value)}
          rows={5}
          placeholder="שלום {שם_פרטי}, ..."
          className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1 text-end">{templateBody.length} תווים</p>
      </div>

      {/* Preview */}
      {showPreview && recipients.length > 0 && templateBody && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">תצוגה מקדימה</p>
          {getPreviewMessages().map((msg, i) => (
            <div key={i} className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-400 mb-1">
                {recipients[i]?.firstName} {recipients[i]?.lastName}
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          icon={<Eye className="w-3.5 h-3.5" />}
          onClick={() => setShowPreview(!showPreview)}
          disabled={!templateBody || !segmentId}
        >
          {showPreview ? 'הסתר תצוגה' : 'תצוגה מקדימה'}
        </Button>
        <Button
          size="sm"
          icon={<Send className="w-3.5 h-3.5" />}
          onClick={handleSend}
          loading={sending}
          disabled={!templateBody.trim() || !segmentId || recipients.length === 0}
          className="flex-1"
        >
          שלח סימולציה ({recipients.length} נמענים)
        </Button>
      </div>
    </div>
  )
}
