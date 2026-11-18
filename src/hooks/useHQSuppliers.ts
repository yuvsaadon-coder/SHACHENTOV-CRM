import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, deleteField } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQSupplier } from '../types'
import { normalizeSupplier } from '../lib/hqNormalize'

/** An explicit undefined means "cleared in the form": remove the field instead of keeping the old value. */
export function clearUndefined<T extends object>(data: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === undefined ? deleteField() : v]))
}

export function useHQSuppliers() {
  const [suppliers, setSuppliers] = useState<HQSupplier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'hq_suppliers'), orderBy('name'))
    return onSnapshot(q, (snap) => {
      setSuppliers(snap.docs.map((d) => normalizeSupplier(d.id, d.data() as Partial<HQSupplier>)))
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

export function useDeleteHQSupplier() {
  return async (id: string) => {
    await deleteDoc(doc(db, 'hq_suppliers', id))
  }
}

export function useUpdateHQSupplier() {
  const { firebaseUser: user } = useAuth()
  return async (id: string, data: Partial<HQSupplier>) => {
    await updateDoc(doc(db, 'hq_suppliers', id), {
      ...clearUndefined(data),
      updatedBy: user?.uid ?? '',
      updatedAt: serverTimestamp(),
    })
  }
}
