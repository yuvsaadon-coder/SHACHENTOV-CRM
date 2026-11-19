import { useState } from 'react'
import { PartnersTab } from '../components/hq-knowledge/PartnersTab'
import { SuppliersTab } from '../components/hq-knowledge/SuppliersTab'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'

type TabId = 'suppliers' | 'partners' | 'platforms'

const TABS: { id: TabId; label: string; icon: string; title: string; subtitle: string }[] = [
  { id: 'suppliers', label: 'ספקים', icon: '🏪', title: 'ספקים', subtitle: 'ספקים ונותני שירות של העמותה, והסניפים שהם מספקים להם' },
  { id: 'partners', label: 'שותפים', icon: '🤝', title: 'שותפים', subtitle: 'ארגונים, קרנות וגופים שהעמותה עובדת איתם' },
  { id: 'platforms', label: 'פלטפורמות', icon: '🧩', title: 'פלטפורמות', subtitle: 'מערכות סליקה וקבלות ופלטפורמות התנדבות' },
]

export function PartnersSuppliersShell() {
  const [activeTab, setActiveTab] = useState<TabId>('suppliers')
  const tab = TABS.find((t) => t.id === activeTab)!

  return (
    <div className="flex flex-col min-h-0" dir="rtl">
      <div className="bg-white border-b border-gray-100 -mx-4 px-4 mb-5 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
                style={{ borderBottomColor: isActive ? '#141348' : 'transparent', color: isActive ? '#141348' : '#6B7280' }}
              >
                <span className="text-base">{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <span className="text-2xl">{tab.icon}</span>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>{tab.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tab.subtitle}</p>
        </div>
      </div>

      <ErrorBoundary key={activeTab} label="שגיאה בטעינת הלשונית">
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'partners' && <PartnersTab types={['partner']} defaultType="partner" emptyText="אין שותפים" />}
        {activeTab === 'platforms' && <PartnersTab types={['payment', 'volunteering']} defaultType="volunteering" emptyText="אין פלטפורמות" />}
      </ErrorBoundary>
    </div>
  )
}
