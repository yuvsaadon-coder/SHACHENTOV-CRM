'use client'

import { Menu, Bell } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

interface TopNavProps {
  onMenuClick: () => void
}

export function TopNav({ onMenuClick }: TopNavProps) {
  const { appUser } = useAuth()

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        {appUser && (
          <span
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-semibold',
              appUser.role === 'SuperAdmin'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-blue-100 text-blue-700'
            )}
          >
            {appUser.role === 'SuperAdmin' ? 'מנהל מערכת' : 'מנהל תוכנית'}
          </span>
        )}

        <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative">
          <Bell className="w-5 h-5" />
        </button>

        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
          {appUser?.name?.charAt(0) ?? '?'}
        </div>
      </div>
    </header>
  )
}
