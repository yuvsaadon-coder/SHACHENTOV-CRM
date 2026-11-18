import { useState } from 'react'
import type { Branch } from '../../types'
import { useShifts } from '../../hooks/useShifts'
import { useAssignments } from '../../hooks/useAssignments'
import { useVolunteerMembers } from '../../hooks/useVolunteerMembers'
import { useMonthlyResponses } from '../../hooks/useMonthlyResponses'
import { buildReport, currentMonth, nextMonth, prevMonth, monthLabel } from '../../lib/volunteerUtils'

interface Props { branch: Branch }

export function ReportTab({ branch }: Props) {
  const [month, setMonth] = useState(currentMonth())
  const [copied, setCopied] = useState(false)
  const { shifts } = useShifts(branch.id, month)
  const { assignments } = useAssignments(branch.id, month)
  const { volunteers } = useVolunteerMembers(branch.id)
  const { responses } = useMonthlyResponses(branch.id, month)

  const text = buildReport({ branchName: branch.name, month, shifts, assignments, volunteers, responses })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.getElementById('vol-report-text') as HTMLTextAreaElement | null
      el?.select()
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-gray-100">
        <button onClick={() => setMonth(prevMonth(month))} className="text-gray-400 hover:text-gray-600 text-lg">›</button>
        <span className="font-semibold text-sm" style={{ color: '#141348' }}>{monthLabel(month)}</span>
        <button onClick={() => setMonth(nextMonth(month))} className="text-gray-400 hover:text-gray-600 text-lg rotate-180">›</button>
      </div>

      <textarea id="vol-report-text" readOnly value={text} rows={Math.min(24, text.split('\n').length + 1)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white resize-none leading-relaxed" />

      <button onClick={() => void copy()}
        className="w-full py-2.5 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: '#141348' }}>
        {copied ? 'הועתק ✓' : '📋 העתק כטקסט'}
      </button>
    </div>
  )
}
