import { createContext, useContext, useEffect, useState } from 'react'
import type { AppUser, ArchiveDoc } from './lib/model.ts'
import type { Taxonomy } from './lib/taxonomy.ts'

export interface Ctx {
  user: AppUser
  tax: Taxonomy
  docs: ArchiveDoc[]
}

export const AppCtx = createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('AppCtx missing')
  return c
}

/** ניתוב פשוט מבוסס hash: #/doc/ID, #/upload?versionOf=ID וכו' */
export function useRoute(): { path: string[]; params: URLSearchParams } {
  const parse = () => {
    const h = window.location.hash.replace(/^#\/?/, '')
    const [p, q] = h.split('?')
    return { path: p.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(q ?? '') }
  }
  const [r, setR] = useState(parse)
  useEffect(() => {
    const on = () => setR(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

export function go(hash: string) {
  window.location.hash = hash
}

export function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' }) : ''
}

export function fmtDateTime(d: Date | null): string {
  return d ? d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

/** הודעת שגיאה ידידותית - כולל תרגום של שגיאות הרשאה מ-Firebase */
export function errMsg(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code.includes('permission-denied') || code.includes('unauthorized')) return 'אין הרשאה לפעולה הזו (או שהנתונים לא עברו את בדיקות השרת).'
  if (code.includes('unavailable')) return 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.'
  if (code.includes('popup-closed')) return 'חלון הכניסה נסגר.'
  return (e as Error)?.message ?? String(e)
}
