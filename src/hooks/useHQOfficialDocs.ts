import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQOfficialDoc } from '../types'

export function useHQOfficialDocs() {
  const [docs, setDocs] = useState<HQOfficialDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(collection(db, 'hq_official_docs'), (snap) => {
      setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HQOfficialDoc)))
      setLoading(false)
    })
  }, [])

  return { docs, loading }
}

export function useAddHQOfficialDoc() {
  const { firebaseUser: user } = useAuth()
  return async (data: Omit<HQOfficialDoc, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => {
    await addDoc(collection(db, 'hq_official_docs'), {
      ...data,
      active: true,
      createdBy: user?.uid ?? '',
      updatedBy: user?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export function useUpdateHQOfficialDoc() {
  const { firebaseUser: user } = useAuth()
  return async (id: string, data: Partial<HQOfficialDoc>) => {
    await updateDoc(doc(db, 'hq_official_docs', id), {
      ...data,
      updatedBy: user?.uid ?? '',
      updatedAt: serverTimestamp(),
    })
  }
}
