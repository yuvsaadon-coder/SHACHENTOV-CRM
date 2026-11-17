import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQDriveLink } from '../types'

export function useHQDriveLinks() {
  const [links, setLinks] = useState<HQDriveLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'hq_drive_links'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setLinks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HQDriveLink)))
      setLoading(false)
    })
  }, [])

  return { links, loading }
}

export function useAddHQDriveLink() {
  const { firebaseUser: user } = useAuth()
  return async (data: Omit<HQDriveLink, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) => {
    await addDoc(collection(db, 'hq_drive_links'), {
      ...data,
      active: true,
      createdBy: user?.uid ?? '',
      updatedBy: user?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export function useUpdateHQDriveLink() {
  const { firebaseUser: user } = useAuth()
  return async (id: string, data: Partial<HQDriveLink>) => {
    await updateDoc(doc(db, 'hq_drive_links', id), {
      ...data,
      updatedBy: user?.uid ?? '',
      updatedAt: serverTimestamp(),
    })
  }
}

export function useDeleteHQDriveLink() {
  return async (id: string) => {
    await deleteDoc(doc(db, 'hq_drive_links', id))
  }
}
