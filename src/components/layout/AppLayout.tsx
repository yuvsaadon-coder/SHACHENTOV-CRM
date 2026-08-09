import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-[#F7FAFA] font-sans">
      {/* Desktop sidebar */}
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 z-10">
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="fixed top-0 inset-x-0 z-40 md:hidden h-14 bg-brand-navy text-white flex items-center justify-between px-4 shadow-md">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-lg hover:bg-white/10 text-2xl leading-none"
          aria-label="תפריט"
        >
          ☰
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">שכן טוב CRM</span>
          <img src="/logo_shachentov.png" alt="שכן טוב" className="h-8 w-8 rounded-full object-cover" />
        </div>
      </div>

      <main className="flex-1 overflow-auto p-4 md:p-6 pt-[72px] md:pt-6">
        <Outlet />
      </main>
    </div>
  )
}
