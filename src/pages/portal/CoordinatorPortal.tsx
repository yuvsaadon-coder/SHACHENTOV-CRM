import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../hooks/useBranch'
import { Spinner } from '../../components/ui/Spinner'
import type { Branch } from '../../types'

export type PortalOutletContext = { branch: Branch }

const NAV_ITEMS = [
  { to: '/portal/home',      label: 'בית',    icon: '🏠' },
  { to: '/portal/report',    label: 'דיווח',  icon: '📋' },
  { to: '/portal/knowledge', label: 'ידע',    icon: '📚' },
  { to: '/portal/chat',      label: "צ'אט",   icon: '🤖' },
]

function BranchPicker({ branches, onSelect }: { branches: Branch[]; onSelect: (id: string) => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F7FAFA' }} dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/logo_shachentov.png" alt="שכן טוב" className="h-16 w-16 rounded-full object-cover mx-auto mb-3" />
          <h1 className="text-xl font-bold" style={{ color: '#141348' }}>בחר סניף</h1>
          <p className="text-sm text-gray-500 mt-1">יש לך מספר סניפים — באיזה תרצה להתחבר?</p>
        </div>
        <div className="space-y-2">
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelect(b.id)}
              className="w-full text-right px-4 py-3 rounded-xl border border-gray-200 hover:border-[#189A9F] hover:bg-[#E6F4F4] transition-all"
            >
              <div className="font-medium text-sm" style={{ color: '#141348' }}>{b.name}</div>
              <div className="text-xs text-gray-500">{b.city}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CoordinatorPortal() {
  const { appUser, logOut } = useAuth()
  const navigate = useNavigate()
  const { branches, loading } = useBranch()
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

  useEffect(() => {
    if (branches.length === 1) setSelectedBranchId(branches[0].id)
  }, [branches])

  const handleLogout = async () => {
    await logOut()
    navigate('/login')
  }

  if (loading) return <Spinner size="lg" />

  if (branches.length > 1 && !selectedBranchId) {
    return <BranchPicker branches={branches} onSelect={setSelectedBranchId} />
  }

  if (branches.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-gray-500">אין סניפים מוגדרים למשתמש זה.</p>
          <button onClick={handleLogout} className="mt-4 text-sm text-[#189A9F] underline">יציאה</button>
        </div>
      </div>
    )
  }

  const branch = branches.find((b) => b.id === selectedBranchId) ?? branches[0]

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F7FAFA' }} dir="rtl">
      {/* Top header */}
      <header
        className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between shadow-sm"
        style={{ backgroundColor: '#141348' }}
      >
        <div className="flex items-center gap-3">
          <img src="/logo_shachentov.png" alt="" className="h-8 w-8 rounded-full object-cover" />
          <div>
            <div className="font-bold text-sm text-white">{branch.name}</div>
            <div className="text-xs text-white/60">{appUser?.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {branches.length > 1 && (
            <button
              onClick={() => setSelectedBranchId(null)}
              className="text-xs text-white/70 hover:text-white border border-white/20 rounded px-2 py-1"
            >
              החלף סניף
            </button>
          )}
          <button onClick={handleLogout} className="text-xs text-white/60 hover:text-white">יציאה</button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet context={{ branch } satisfies PortalOutletContext} />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-40">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                isActive ? 'text-[#189A9F]' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
