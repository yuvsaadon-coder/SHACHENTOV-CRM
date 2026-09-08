import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { Branch } from '../types'

export function useBranch() {
  const { appUser } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!appUser?.uid) { setLoading(false); return }
    const q = query(
      collection(db, 'branches'),
      where('coordinatorUids', 'array-contains', appUser.uid)
    )
    return onSnapshot(
      q,
      (snap) => {
        setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Branch)))
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [appUser?.uid])

  return { branches, loading }
}

export function useAllBranches() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'branches'),
      (snap) => {
        setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Branch)))
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [])

  return { branches, loading }
}
