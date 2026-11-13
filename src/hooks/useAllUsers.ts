import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { AppUser } from '../types'

export function useAllUsers() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'users'), where('active', '==', true))
    return onSnapshot(
      q,
      (snap) => {
        setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)))
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [])

  return { users, loading }
}
