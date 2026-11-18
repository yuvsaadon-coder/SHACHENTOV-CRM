import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { PortalOutletContext } from './CoordinatorPortal'
import { ShiftsTab } from '../../components/volunteers/ShiftsTab'
import { VolunteersTab } from '../../components/volunteers/VolunteersTab'
import { TrackingTab } from '../../components/volunteers/TrackingTab'
import { SendTab } from '../../components/volunteers/SendTab'
import { RemindersTab } from '../../components/volunteers/RemindersTab'
import { ReportTab } from '../../components/volunteers/ReportTab'

type Tab = 'shifts' | 'volunteers' | 'tracking' | 'send' | 'reminders' | 'report'

const TABS: { id: Tab; label: string }[] = [
  { id: 'shifts',     label: 'חלוקות' },
  { id: 'volunteers', label: 'מתנדבים' },
  { id: 'tracking',   label: 'מעקב' },
  { id: 'send',       label: 'שליחה' },
  { id: 'reminders',  label: 'תזכורות' },
  { id: 'report',     label: 'דוח' },
]

export function PortalVolunteers() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const [tab, setTab] = useState<Tab>('shifts')

  return (
    <div>
      {/* Tab bar */}
      <div className="sticky top-14 z-30 bg-white border-b border-gray-100 flex" dir="rtl">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-xs font-medium transition-colors ${
              tab === t.id ? 'border-b-2 border-[#189A9F] text-[#189A9F]' : 'text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div dir="rtl">
        {tab === 'shifts'     && <ShiftsTab     branch={branch} />}
        {tab === 'volunteers' && <VolunteersTab  branch={branch} />}
        {tab === 'tracking'   && <TrackingTab   branch={branch} />}
        {tab === 'send'       && <SendTab        branch={branch} />}
        {tab === 'reminders'  && <RemindersTab   branch={branch} />}
        {tab === 'report'     && <ReportTab      branch={branch} />}
      </div>
    </div>
  )
}
