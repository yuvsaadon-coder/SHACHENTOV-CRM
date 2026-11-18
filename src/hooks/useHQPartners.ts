import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQPartner, PartnerStatus } from '../types'

import { clearUndefined } from './useHQSuppliers'

export function useHQPartners() {
  const [partners, setPartners] = useState<HQPartner[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'hq_partners'), orderBy('name'))
    return onSnapshot(q, (snap) => {
      setPartners(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HQPartner)))
      setLoading(false)
    })
  }, [])

  return { partners, loading }
}

export function useAddHQPartner() {
  const { firebaseUser: user } = useAuth()
  return async (data: Omit<HQPartner, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'statusHistory'>) => {
    await addDoc(collection(db, 'hq_partners'), {
      ...data,
      statusHistory: [{ status: data.status, changedBy: user?.uid ?? '', changedAt: Timestamp.now() }],
      active: true,
      createdBy: user?.uid ?? '',
      updatedBy: user?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export function useDeleteHQPartner() {
  return async (id: string) => {
    await deleteDoc(doc(db, 'hq_partners', id))
  }
}

export function useUpdateHQPartner() {
  const { firebaseUser: user } = useAuth()
  return async (id: string, data: Partial<HQPartner>, prevStatus?: PartnerStatus) => {
    const update: Record<string, unknown> = {
      ...clearUndefined(data),
      updatedBy: user?.uid ?? '',
      updatedAt: serverTimestamp(),
    }
    if (data.status && data.status !== prevStatus) {
      // append to statusHistory
      update.statusHistory = [
        ...(data.statusHistory ?? []),
        { status: data.status, changedBy: user?.uid ?? '', changedAt: Timestamp.now(), previous: prevStatus },
      ]
    }
    await updateDoc(doc(db, 'hq_partners', id), update)
  }
}
