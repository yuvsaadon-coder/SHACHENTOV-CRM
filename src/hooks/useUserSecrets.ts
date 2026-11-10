import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'

/**
 * HQ login passwords that management set (the phone number by default).
 * Readable by managers only; a password a person chose for themselves is never stored.
 */
export function useUserSecrets(enabled: boolean) {
  const [passwords, setPasswords] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!enabled) return
    return onSnapshot(
      collection(db, 'userSecrets'),
      (snap) => {
        const next: Record<string, string> = {}
        snap.forEach((d) => { next[d.id] = (d.data() as { password?: string }).password ?? '' })
        setPasswords(next)
      },
      () => setPasswords({}),
    )
  }, [enabled])

  return enabled ? passwords : {}
}
