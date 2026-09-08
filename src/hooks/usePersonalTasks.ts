import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { PersonalTask } from '../types'

export function usePersonalTasks(uid: string | undefined) {
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) { setPersonalTasks([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    const q = query(collection(db, 'users', uid, 'personalTasks'), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        setPersonalTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PersonalTask)))
        setLoading(false)
      },
      // Without this, a denied request (e.g. firestore.rules not yet
      // published for this new subcollection) leaves loading stuck at true
      // forever — the spinner never resolves and the page looks broken
      // instead of explaining what's wrong.
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
  }, [uid])

  return { personalTasks, loading, error }
}
