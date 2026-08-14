import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { QuarterlyReport } from '../types'

/** Every branch's reports, newest first — the HQ-wide counterpart of useQuarterlyReports. */
export function useAllQuarterlyReports() {
  const [reports, setReports] = useState<QuarterlyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'quarterlyReports'),
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as QuarterlyReport))
          .sort((a, b) => (b.year - a.year) || b.quarter.localeCompare(a.quarter))
        setReports(sorted)
        setLoading(false)
      },
      (err) => { setError(err.message); setLoading(false) }
    )
  }, [])

  return { reports, loading, error }
}
