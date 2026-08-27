import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'

export const metadata: Metadata = {
  title: 'Ecosystem CRM — ניהול תוכניות וקהילת בוגרים',
  description: 'מערכת CRM לניהול מועמדים, משתתפים ובוגרי תוכניות מובילות',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
