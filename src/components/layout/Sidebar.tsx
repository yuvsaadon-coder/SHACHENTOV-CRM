import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { DOMAIN_LABELS, DOMAINS, type Domain } from '../../types'

interface NavItem { to: string; label: string; icon: string; adminOnly: boolean }
interface NavGroup { title: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    title: 'משימות',
    items: [
      { to: '/dashboard', label: 'לוח בקרה', icon: '📊', adminOnly: false },
      { to: '/tasks', label: 'משימות', icon: '✅', adminOnly: false },
      { to: '/my-tasks', label: 'משימות אישיות', icon: '📌', adminOnly: false },
      { to: '/reports', label: 'דיווחים רבעוניים', icon: '📈', adminOnly: false },
      { to: '/admin/report-questions', label: 'עריכת שאלות דיווח', icon: '📝', adminOnly: true },
      { to: '/admin/branches', label: 'פורטל רכזים', icon: '📋', adminOnly: true },
    ],
  },
  {
    title: 'תפקידים',
    items: [
      { to: '/roles', label: 'איוש תפקידים', icon: '🏢', adminOnly: false },
      { to: '/orgchart', label: 'מבנה ארגוני', icon: '🌳', adminOnly: false },
      { to: '/contacts', label: 'אנשי קשר', icon: '👥', adminOnly: false },
      { to: '/branches', label: 'סניפים', icon: '🏪', adminOnly: false },
    ],
  },
  {
    title: 'מאגר ידע',
    items: [
      { to: '/hq-knowledge', label: 'מאגר ידע מטה', icon: '🗃️', adminOnly: false },
      { to: '/knowledge', label: 'ספריית ידע', icon: '📚', adminOnly: false },
      { to: '/hq-chat', label: "צ'אטבוט מטה", icon: '🤖', adminOnly: false },
      { to: '/admin/knowledge', label: 'ניהול ספרייה', icon: '📖', adminOnly: true },
      { to: '/admin/seed', label: 'סידינג', icon: '🌱', adminOnly: true },
    ],
  },
]

interface Props {
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ onClose, collapsed = false, onToggleCollapse }: Props) {
  const { appUser, logOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logOut()
    navigate('/login')
  }

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || appUser?.role === 'admin'),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-brand-navy min-h-screen flex flex-col text-white shrink-0 transition-[width] duration-200`}>
      {/* Logo + close/collapse button */}
      <div className={`p-4 border-b border-white/10 flex items-center gap-3 ${collapsed ? 'justify-center px-2' : ''}`}>
        <img src="/logo_shachentov.png" alt="שכן טוב" className="h-10 w-10 rounded-full object-cover shrink-0" />
        {!collapsed && (
          <div className="flex-1">
            <div className="font-bold text-sm">שכן טוב</div>
            <div className="text-xs text-white/60">מערכת CRM</div>
          </div>
        )}
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

      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex items-center justify-center py-1.5 text-white/50 hover:text-white hover:bg-white/10 border-b border-white/10 text-xs transition-colors"
          aria-label={collapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
          title={collapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
        >
          {collapsed ? '»' : '« כיווץ תפריט'}
        </button>
      )}

      {/* Main nav */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {visibleGroups.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <div className="px-4 mb-1.5 text-xs uppercase tracking-wider text-white/40">
                {group.title}
              </div>
            )}
            <ul className="space-y-1 px-2">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${collapsed ? 'justify-center' : ''} ${
                        isActive
                          ? 'bg-brand-teal text-white'
                          : 'text-white/80 hover:bg-white/10'
                      }`
                    }
                  >
                    <span>{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Domain filter shortcuts */}
        {!collapsed && (
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
        )}
      </nav>

      {/* User info + logout */}
      <div className={`p-4 border-t border-white/10 ${collapsed ? 'px-2' : ''}`}>
        {!collapsed && (
          <>
            <div className="text-sm font-medium">{appUser?.name}</div>
            <div className="text-xs text-white/50 mb-3">{appUser?.email}</div>
          </>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'יציאה' : undefined}
          className="w-full text-xs bg-white/10 hover:bg-white/20 rounded px-3 py-1.5 transition-colors"
        >
          {collapsed ? '⏻' : 'יציאה'}
        </button>
      </div>
    </aside>
  )
}
