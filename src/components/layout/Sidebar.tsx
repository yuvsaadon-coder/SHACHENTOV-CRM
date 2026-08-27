'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  LayoutDashboard,
  GitBranch,
  FileText,
  Filter,
  MessageSquare,
  Building2,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'דשבורד',
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    href: '/profiles',
    label: 'פרופילים',
    icon: <Users className="w-4 h-4" />,
  },
  {
    href: '/programs',
    label: 'תוכניות ומחזורים',
    icon: <GitBranch className="w-4 h-4" />,
  },
  {
    href: '/forms',
    label: 'טפסים',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    href: '/segments',
    label: 'מנוע חיתוך',
    icon: <Filter className="w-4 h-4" />,
  },
  {
    href: '/broadcasts',
    label: 'שליחת הודעות',
    icon: <MessageSquare className="w-4 h-4" />,
  },
  {
    href: '/organizations',
    label: 'ארגונים',
    icon: <Building2 className="w-4 h-4" />,
    adminOnly: true,
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { appUser, isSuperAdmin } = useAuth()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'flex flex-col z-30 bg-white border-e border-gray-200 transition-all duration-200 ease-in-out',
          'fixed lg:static inset-y-0 end-0',
          open ? 'w-60 translate-x-0' : 'w-0 lg:w-16 overflow-hidden'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 flex-shrink-0">
          {open ? (
            <>
              <span className="font-bold text-blue-700 text-sm whitespace-nowrap">
                Ecosystem CRM
              </span>
              <button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-gray-100 lg:hidden"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center mx-auto">
              <Users className="w-4 h-4 text-white" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {NAV_ITEMS.filter(item => !item.adminOnly || isSuperAdmin).map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'sidebar-nav-item',
                  isActive && 'active'
                )}
              >
                {item.icon}
                {open && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User footer */}
        <div className="flex-shrink-0 border-t border-gray-100 p-3">
          {open ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {appUser?.name ?? 'משתמש'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {appUser?.role === 'SuperAdmin' ? 'מנהל מערכת' : 'מנהל תוכנית'}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0"
                title="יציאה"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignOut}
              className="w-full flex justify-center p-1.5 rounded hover:bg-gray-100 text-gray-400"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
