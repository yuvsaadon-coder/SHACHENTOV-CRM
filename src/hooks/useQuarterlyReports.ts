import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { QuarterlyReport } from '../types'

export function useQuarterlyReports(branchId: string | null) {
  const [reports, setReports] = useState<QuarterlyReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId) { setLoading(false); return }
    const q = query(collection(db, 'quarterlyReports'), where('branchId', '==', branchId))
    return onSnapshot(
      q,
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as QuarterlyReport))
          .sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year
            return b.quarter.localeCompare(a.quarter)
          })
        setReports(sorted)
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [branchId])

  return { reports, loading }
}
