import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQSupplier } from '../types'

export function useHQSuppliers() {
  const [suppliers, setSuppliers] = useState<HQSupplier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'hq_suppliers'), orderBy('name'))
    return onSnapshot(q, (snap) => {
      setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HQSupplier)))
      setLoading(false)
    })
  }, [])

  return { suppliers, loading }
}

export function useAddHQSupplier() {
  const { firebaseUser: user } = useAuth()
  return async (data: Omit<HQSupplier, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => {
    await addDoc(collection(db, 'hq_suppliers'), {
      ...data,
      active: true,
      createdBy: user?.uid ?? '',
      updatedBy: user?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export function useUpdateHQSupplier() {
  const { firebaseUser: user } = useAuth()
  return async (id: string, data: Partial<HQSupplier>) => {
    await updateDoc(doc(db, 'hq_suppliers', id), {
      ...data,
      updatedBy: user?.uid ?? '',
      updatedAt: serverTimestamp(),
    })
  }
}
