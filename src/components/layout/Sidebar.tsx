import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { DOMAIN_LABELS, DOMAINS, type Domain } from '../../types'

const navItems = [
  { to: '/dashboard', label: 'לוח בקרה', icon: '📊' },
  { to: '/tasks', label: 'משימות', icon: '✅' },
  { to: '/contacts', label: 'אנשי קשר', icon: '👥' },
  { to: '/roles', label: 'איוש תפקידים', icon: '🏢' },
  { to: '/orgchart', label: 'מבנה ארגוני', icon: '🌳' },
]

interface Props {
  onClose?: () => void
}

export function Sidebar({ onClose }: Props) {
  const { appUser, logOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logOut()
    navigate('/login')
  }

  return (
    <aside className="w-64 bg-brand-navy min-h-screen flex flex-col text-white shrink-0">
      {/* Logo + close button (mobile) */}
      <div className="p-4 border-b border-white/10 flex items-center gap-3">
        <img src="/logo_shachentov.png" alt="שכן טוב" className="h-10 w-10 rounded-full object-cover" />
        <div className="flex-1">
          <div className="font-bold text-sm">שכן טוב</div>
          <div className="text-xs text-white/60">מערכת CRM</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white text-xl leading-none"
            aria-label="סגור"
          >
            ×
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-brand-teal text-white'
                      : 'text-white/80 hover:bg-white/10'
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Domain filter shortcuts */}
        <div className="mt-6 px-4">
          <div className="text-xs uppercase tracking-wider text-white/40 mb-2">תחומים</div>
          <ul className="space-y-1">
            {DOMAINS.map((domain) => (
              <li key={domain}>
                <NavLink
                  to={`/tasks?domain=${domain}`}
                  onClick={onClose}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-yellow" />
                  {DOMAIN_LABELS[domain as Domain]}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* User info + logout */}
      <div className="p-4 border-t border-white/10">
        <div className="text-sm font-medium">{appUser?.name}</div>
        <div className="text-xs text-white/50 mb-3">{appUser?.email}</div>
        <button
          onClick={handleLogout}
          className="w-full text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1.5 transition-colors"
        >
          יציאה
        </button>
      </div>
    </aside>
  )
}
