import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { PersonalTask } from '../types'

export function usePersonalTasks(uid: string | undefined) {
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) { setPersonalTasks([]); setLoading(false); return }
    const q = query(collection(db, 'users', uid, 'personalTasks'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setPersonalTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PersonalTask)))
      setLoading(false)
    })
  }, [uid])

  return { personalTasks, loading }
}
