import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQFinanceDoc } from '../types'

export function useHQFinance() {
  const [docs, setDocs] = useState<HQFinanceDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'hq_finance'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HQFinanceDoc)))
      setLoading(false)
    })
  }, [])

  return { docs, loading }
}

export function useAddHQFinanceDoc() {
  const { firebaseUser: user } = useAuth()
  return async (data: Omit<HQFinanceDoc, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => {
    await addDoc(collection(db, 'hq_finance'), {
      ...data,
      active: true,
      createdBy: user?.uid ?? '',
      updatedBy: user?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export function useUpdateHQFinanceDoc() {
  const { firebaseUser: user } = useAuth()
  return async (id: string, data: Partial<HQFinanceDoc>) => {
    await updateDoc(doc(db, 'hq_finance', id), {
      ...data,
      updatedBy: user?.uid ?? '',
      updatedAt: serverTimestamp(),
    })
  }
}
