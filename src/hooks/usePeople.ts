import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { AppUser } from '../types'

/** Everyone in the people directory (`users`), active or not. HQ only. */
export function usePeople() {
  const [people, setPeople] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setPeople(
          snap.docs
            .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
            // Older coordinator records carry a placeholder address that was never a real mailbox.
            .map((p) => ((p.email ?? '').endsWith('.internal') ? { ...p, email: '' } : p))
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'he')),
        )
        setLoading(false)
      },
      (err) => { setError(err.message); setLoading(false) },
    )
  }, [])

  return { people, loading, error }
}
