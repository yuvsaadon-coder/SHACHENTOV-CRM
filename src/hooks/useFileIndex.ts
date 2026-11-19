import { useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export interface FileIndexStatus { total: number; indexed: number; pending: number; failed: number; ocrPending: number }
export interface FileIndexRun { done: number; failed: number; remaining: number }

/** What the HQ chatbot has read of the uploaded files, and a way to read the rest. */
export function useFileIndex() {
  const { firebaseUser } = useAuth()
  const [status, setStatus] = useState<FileIndexStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const call = useCallback(async (body: object): Promise<Record<string, unknown>> => {
    const token = await firebaseUser?.getIdToken()
    const res = await fetch('/.netlify/functions/index-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `שגיאה (${res.status})`)
    return data
  }, [firebaseUser])

  const refresh = useCallback(async (): Promise<FileIndexStatus | null> => {
    try {
      const d = (await call({ mode: 'status' })) as unknown as FileIndexStatus
      setStatus(d)
      return d
    } catch {
      return null
    }
  }, [call])

  /** The server works in short rounds; keep going until nothing is left or a round makes no progress. */
  const runAll = useCallback(async (onProgress?: (r: FileIndexRun) => void): Promise<FileIndexRun> => {
    setBusy(true)
    const total: FileIndexRun = { done: 0, failed: 0, remaining: 0 }
    try {
      for (let round = 0; round < 20; round++) {
        const r = (await call({ mode: 'run' })) as unknown as FileIndexRun
        total.done += r.done
        total.failed += r.failed
        total.remaining = r.remaining
        onProgress?.({ ...total })
        if (r.remaining === 0 || r.done + r.failed === 0) break
      }
    } finally {
      setBusy(false)
      await refresh()
    }
    return total
  }, [call, refresh])

  /**
   * Scanned PDFs are transcribed by a background function that runs for minutes: start it,
   * then watch the status until no scanned file is left waiting.
   */
  const runOcr = useCallback(async (onProgress?: (s: FileIndexStatus | null) => void): Promise<FileIndexStatus | null> => {
    setBusy(true)
    try {
      const token = await firebaseUser?.getIdToken()
      const res = await fetch('/.netlify/functions/index-files-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: '{}',
      })
      if (!res.ok) throw new Error(`הפעלת הקריאה נכשלה (${res.status})`)
      let last: FileIndexStatus | null = null
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 6000))
        last = await refresh()
        onProgress?.(last)
        if (!last || last.ocrPending === 0) break
      }
      return last
    } finally {
      setBusy(false)
    }
  }, [firebaseUser, refresh])

  return { status, busy, refresh, runAll, runOcr }
}
