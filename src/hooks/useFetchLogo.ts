import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export type LogoCollectionName = 'hq_partners' | 'hq_suppliers'
export interface LogoResult { ok: boolean; logoUrl?: string; error?: string }
export interface BulkLogoResult { done: number; failed: number; remaining: number }

/** Asks the server to find and store an organisation's logo from its website. HQ only. */
export function useFetchLogo() {
  const { firebaseUser } = useAuth()
  const [busy, setBusy] = useState(false)

  const call = async (body: object): Promise<Record<string, unknown>> => {
    const token = await firebaseUser?.getIdToken()
    const res = await fetch('/.netlify/functions/fetch-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return res.ok ? data : { ok: false, error: typeof data.error === 'string' ? data.error : 'משיכת הלוגו נכשלה' }
  }

  const fetchLogo = async (collection: LogoCollectionName, id: string): Promise<LogoResult> => {
    setBusy(true)
    try {
      return (await call({ collection, id })) as unknown as LogoResult
    } catch {
      return { ok: false, error: 'שגיאת רשת' }
    } finally {
      setBusy(false)
    }
  }

  /** The server works in short rounds; keep asking until nothing is left or a round makes no progress. */
  const fetchAllMissing = async (onProgress?: (r: BulkLogoResult) => void): Promise<BulkLogoResult> => {
    setBusy(true)
    const total: BulkLogoResult = { done: 0, failed: 0, remaining: 0 }
    try {
      for (let round = 0; round < 15; round++) {
        const r = (await call({ all: true })) as unknown as Partial<BulkLogoResult> & { ok?: boolean }
        if (!r.ok) break
        total.done += r.done ?? 0
        total.failed += r.failed ?? 0
        total.remaining = r.remaining ?? 0
        onProgress?.({ ...total })
        if (total.remaining === 0 || (r.done ?? 0) + (r.failed ?? 0) === 0) break
      }
    } catch {
      /* report what was done so far */
    } finally {
      setBusy(false)
    }
    return total
  }

  return { fetchLogo, fetchAllMissing, busy }
}
