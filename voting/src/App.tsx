import { useEffect } from 'react'
import { he } from './i18n/he'
import { firebaseConfigured } from './data/store'
import { VoteApp } from './features/vote/VoteApp'
import { AdminApp } from './features/admin/AdminApp'

export function isAdminPath(pathname: string): boolean {
  return /^\/admin(\.html)?(\/|$)/.test(pathname)
}

export function App() {
  const admin = isAdminPath(window.location.pathname)
  useEffect(() => { document.title = he.appTitle }, [])
  return (
    <>
      {!firebaseConfigured() && <div className="demo-banner" role="note">{he.demoBanner}</div>}
      {admin ? <AdminApp /> : <VoteApp />}
    </>
  )
}
