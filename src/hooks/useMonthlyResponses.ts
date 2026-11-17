import { useEffect, useState } from 'react'
import {
  collection, query, where, onSnapshot,
  doc, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { MonthlyResponse, MonthlyResponseStatus } from '../types'

export function useMonthlyResponses(branchId: string, month: string) {
  const [responses, setResponses] = useState<MonthlyResponse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId || !month) return
    const q = query(
      collection(db, 'monthly_responses'),
      where('branchId', '==', branchId),
      where('month', '==', month),
    )
    return onSnapshot(q, (snap) => {
      setResponses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MonthlyResponse))
      )
      setLoading(false)
    })
  }, [branchId, month])

  return { responses, loading }
}

export function useSetMonthlyResponse() {
  return async (branchId: string, month: string, volunteerId: string, status: MonthlyResponseStatus) => {
    const id = `${branchId}_${month}_${volunteerId}`
    await setDoc(doc(db, 'monthly_responses', id), {
      branchId, month, volunteerId, status,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }
}
