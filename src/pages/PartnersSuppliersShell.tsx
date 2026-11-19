import { useState } from 'react'
import { PartnersTab } from '../components/hq-knowledge/PartnersTab'
import { SuppliersTab } from '../components/hq-knowledge/SuppliersTab'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useFetchLogo } from '../hooks/useFetchLogo'

type TabId = 'suppliers' | 'partners' | 'platforms'

const TABS: { id: TabId; label: string; icon: string; title: string; subtitle: string }[] = [
  { id: 'suppliers', label: 'ספקים', icon: '🏪', title: 'ספקים', subtitle: 'ספקים ונותני שירות של העמותה, והסניפים שהם מספקים להם' },
  { id: 'partners', label: 'שותפים', icon: '🤝', title: 'שותפים', subtitle: 'ארגונים, קרנות וגופים שהעמותה עובדת איתם' },
  { id: 'platforms', label: 'פלטפורמות', icon: '🧩', title: 'פלטפורמות', subtitle: 'מערכות סליקה וקבלות ופלטפורמות התנדבות' },
]

export function PartnersSuppliersShell() {
  const [activeTab, setActiveTab] = useState<TabId>('suppliers')
  const { access } = useAuth()
  const { toast } = useToast()
  const { fetchAllMissing, busy } = useFetchLogo()
  const canFetch = access === 'admin' || access === 'hq'

  const pullLogos = async () => {
    const r = await fetchAllMissing()
    toast(
      r.done === 0 && r.failed === 0 ? 'אין גופים עם אתר שחסר להם לוגו' : `נמשכו ${r.done} לוגואים${r.failed ? `, ${r.failed} לא נמצאו` : ''}`,
      r.done > 0 ? 'success' : 'info',
    )
  }
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
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>{tab.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tab.subtitle}</p>
        </div>
        {canFetch && (
          <button
            onClick={() => void pullLogos()}
            disabled={busy}
            className="shrink-0 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            title="מוצא ושומר לוגו מהאתר של כל גוף שיש לו אתר"
          >
            {busy ? 'מושך לוגואים...' : '🖼 משוך לוגואים'}
          </button>
        )}
      </div>

      <ErrorBoundary key={activeTab} label="שגיאה בטעינת הלשונית">
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'partners' && <PartnersTab types={['partner']} defaultType="partner" emptyText="אין שותפים" />}
        {activeTab === 'platforms' && <PartnersTab types={['payment', 'volunteering']} defaultType="volunteering" emptyText="אין פלטפורמות" />}
      </ErrorBoundary>
    </div>
  )
}
