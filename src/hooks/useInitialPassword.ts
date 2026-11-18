import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

/**
 * True while an HQ person who signed in with e-mail and password still uses the
 * password management set for them (it is recorded in userSecrets until they pick their own).
 */
export function useInitialPassword(): boolean {
  const { firebaseUser } = useAuth()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setPending(false)
    if (!firebaseUser) return
    let unsub: (() => void) | undefined
    let cancelled = false
    void firebaseUser.getIdTokenResult().then((t) => {
      if (cancelled || t.signInProvider !== 'password') return
      unsub = onSnapshot(
        doc(db, 'userSecrets', firebaseUser.uid),
        (snap) => setPending(snap.exists()),
        () => setPending(false),
      )
    })
    return () => { cancelled = true; unsub?.() }
  }, [firebaseUser])

  return pending
}
