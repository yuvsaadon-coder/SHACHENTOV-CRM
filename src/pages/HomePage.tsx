import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/ui/Spinner'

interface NavCard {
  to: string
  icon: string
  label: string
  adminOnly?: boolean
}

const NAV_CARDS: NavCard[] = [
  { to: '/tasks',         icon: '✅', label: 'משימות'         },
  { to: '/orgchart',      icon: '🌳', label: 'מבנה ארגוני'   },
  { to: '/hq-knowledge',  icon: '🗃️', label: 'מאגר ידע'      },
  { to: '/hq-chat',       icon: '🤖', label: "צ'אטבוט"        },
  { to: '/reports',       icon: '📈', label: 'דיווחים'        },
  { to: '/branches',      icon: '🏪', label: 'סניפים'         },
  { to: '/roles',         icon: '🏢', label: 'איוש תפקידים'  },
  { to: '/contacts',      icon: '👥', label: 'אנשי קשר'       },
]

function hebrewDate() {
  return new Date().toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function HomePage() {
  const { appUser, orgRole, logOut, loading } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logOut()
    navigate('/login')
  }

  if (loading) return <Spinner size="lg" />

  const name = orgRole?.holderName || appUser?.name || ''
  const roleName = orgRole?.roleName || ''
  const isAdmin = appUser?.role === 'admin'

  const cards = NAV_CARDS.filter((c) => !c.adminOnly || isAdmin)

  return (
    <div
      className="min-h-screen flex flex-col"
      dir="rtl"
      style={{ background: 'linear-gradient(160deg, #141348 0%, #0e1035 60%, #0a3a5c 100%)' }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-safe pt-5 pb-2">
        <img
          src="/logo_shachentov.png"
          alt="שכן טוב"
          className="h-9 w-9 object-contain opacity-90"
        />
        <button
          onClick={handleLogout}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          יציאה
        </button>
      </div>

      {/* Greeting */}
      <div className="px-6 pt-6 pb-8">
        <p className="text-white/50 text-sm mb-1">{hebrewDate()}</p>
        <h1 className="text-3xl font-bold text-white leading-tight">
          שלום{name ? `, ${name}` : ''}
        </h1>
        {roleName && (
          <p className="text-sm mt-1.5 font-medium" style={{ color: '#4DD8DC' }}>
            {roleName}
          </p>
        )}
      </div>

      {/* Nav cards */}
      <div className="flex-1 px-4 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => (
            <button
              key={card.to}
              onClick={() => navigate(card.to)}
              className="bg-white/10 hover:bg-white/20 active:bg-white/25 rounded-2xl p-4 text-right transition-colors flex flex-col gap-2 border border-white/10"
            >
              <span className="text-2xl">{card.icon}</span>
              <span className="text-sm font-medium text-white">{card.label}</span>
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            onClick={() => navigate('/admin/users')}
            className="mt-3 w-full bg-white/5 hover:bg-white/10 rounded-xl px-4 py-3 text-right text-sm text-white/60 hover:text-white/80 border border-white/10 transition-colors flex items-center gap-3"
          >
            <span>⚙️</span>
            <span>ניהול מערכת</span>
          </button>
        )}
      </div>
    </div>
  )
}
