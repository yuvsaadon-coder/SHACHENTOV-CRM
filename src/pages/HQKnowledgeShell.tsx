import { useState } from 'react'
import { HQKnowledgePage } from './HQKnowledgePage'
import { FinanceTab } from '../components/hq-knowledge/FinanceTab'
import { OfficialTab } from '../components/hq-knowledge/OfficialTab'
import { DriveLinksTab } from '../components/hq-knowledge/DriveLinksTab'
import { PartnersTab } from '../components/hq-knowledge/PartnersTab'
import { SuppliersTab } from '../components/hq-knowledge/SuppliersTab'

type TabId = 'general' | 'finance' | 'official' | 'drive' | 'partners' | 'suppliers'

interface Tab {
  id: TabId
  label: string
  icon: string
}

const TABS: Tab[] = [
  { id: 'general', label: 'ידע מטה', icon: '🧠' },
  { id: 'finance', label: 'דוחות כספיים', icon: '💰' },
  { id: 'official', label: 'טפסים רשמיים', icon: '📋' },
  { id: 'drive', label: 'מסמכי דרייב', icon: '📁' },
  { id: 'partners', label: 'שותפים ופלטפורמות', icon: '🤝' },
  { id: 'suppliers', label: 'ספקים', icon: '🏪' },
]

export function HQKnowledgeShell() {
  const [activeTab, setActiveTab] = useState<TabId>('general')

  return (
    <div className="flex flex-col min-h-0" dir="rtl">
      {/* Tab bar */}
      <div className="bg-white border-b border-gray-100 -mx-4 px-4 mb-5 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
                style={{
                  borderBottomColor: isActive ? '#141348' : 'transparent',
                  color: isActive ? '#141348' : '#6B7280',
                }}
              >
                <span className="text-base">{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {activeTab === 'general' && <HQKnowledgePage />}
        {activeTab === 'finance' && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">💰</span>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>דוחות ומסמכים כספיים</h1>
                <p className="text-sm text-gray-500 mt-0.5">דוחות שנתיים, תקציבים, דיווחים לקרנות</p>
              </div>
            </div>
            <FinanceTab />
          </div>
        )}
        {activeTab === 'official' && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">📋</span>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>טפסים ומסמכים רשמיים</h1>
                <p className="text-sm text-gray-500 mt-0.5">תעודת רישום, אישור סעיף 46, ניהול תקין</p>
              </div>
            </div>
            <OfficialTab />
          </div>
        )}
        {activeTab === 'drive' && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">📁</span>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>מסמכי Google Drive</h1>
                <p className="text-sm text-gray-500 mt-0.5">קישורים למסמכים, גיליונות ותיקיות Drive</p>
              </div>
            </div>
            <DriveLinksTab />
          </div>
        )}
        {activeTab === 'partners' && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">🤝</span>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>שותפים ופלטפורמות</h1>
                <p className="text-sm text-gray-500 mt-0.5">מערכות סליקה, פלטפורמות התנדבות ושותפויות</p>
              </div>
            </div>
            <PartnersTab />
          </div>
        )}
        {activeTab === 'suppliers' && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">🏪</span>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>ספקים</h1>
                <p className="text-sm text-gray-500 mt-0.5">ספקים ונותני שירות של העמותה</p>
              </div>
            </div>
            <SuppliersTab />
          </div>
        )}
      </div>
    </div>
  )
}
