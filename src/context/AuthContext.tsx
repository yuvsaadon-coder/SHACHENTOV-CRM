import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signInWithCustomToken, GoogleAuthProvider, signOut, type User } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { AccessLevel, AppUser, Domain, StoredOrgRole } from '../types'
import { accessOf, domainOfPerson, isActive, isManager as isManagerUser } from '../lib/peopleLogic'

type OwnRole = StoredOrgRole & { id: string }

interface AuthContextValue {
  firebaseUser: User | null
  appUser: AppUser | null
  /** The positions the signed-in person holds (first one is the primary). */
  orgRoles: OwnRole[]
  orgRole: OwnRole | null
  access: AccessLevel
  isManager: boolean
  /** Task domain of the person's HQ position, if any. */
  domain: Domain | null
  /** False until the person's positions have been loaded (domain may still change). */
  rolesReady: boolean
  loading: boolean
  /** Why the last sign-in was turned away, if it was. */
  authError: string
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  logOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const NO_ACCESS = 'אין לך הרשאת כניסה למערכת. פנה/י למטה העמותה.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [orgRoles, setOrgRoles] = useState<OwnRole[]>([])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let unsubDoc: (() => void) | null = null
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.()
      unsubDoc = null
      setFirebaseUser(user)
      if (!user) {
        setAppUser(null)
        setLoading(false)
        return
      }
      setLoading(true)
      // Live, so a name change, a new position or a deactivation applies at once.
      unsubDoc = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const person = snap.exists() ? ({ uid: user.uid, ...snap.data() } as AppUser) : null
          if (!person || !isActive(person) || accessOf(person) === 'none') {
            setAuthError(NO_ACCESS)
            setAppUser(null)
            setLoading(false)
            void signOut(auth)
            return
          }
          setAuthError('')
          setAppUser(person)
          setLoading(false)
        },
        () => {
          setAppUser(null)
          setLoading(false)
        },
      )
    })
    return () => {
      unsubDoc?.()
      unsubAuth()
    }
  }, [])

  const access = accessOf(appUser)
  const roleIdsKey = access === 'hq' || access === 'admin' ? (appUser?.roleIds ?? []).join(',') : ''

  useEffect(() => {
    if (!roleIdsKey) {
      setOrgRoles([])
      setLoadedKey('')
      return
    }
    let cancelled = false
    Promise.all(roleIdsKey.split(',').map((id) => getDoc(doc(db, 'roles', id))))
      .then((snaps) => {
        if (cancelled) return
        setOrgRoles(snaps.filter((s) => s.exists()).map((s) => ({ ...s.data(), id: s.id } as OwnRole)))
        setLoadedKey(roleIdsKey)
      })
      .catch(() => {
        if (cancelled) return
        setOrgRoles([])
        setLoadedKey(roleIdsKey)
      })
    return () => { cancelled = true }
  }, [roleIdsKey])

  const domain = useMemo(
    () => (appUser ? domainOfPerson(appUser, orgRoles) : null),
    [appUser, orgRoles],
  )

  const signIn = async (email: string, password: string) => {
    setAuthError('')
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signInWithGoogle = async () => {
    setAuthError('')
    const provider = new GoogleAuthProvider()

    // 1. Google popup → Firebase issues an ID token for the Google UID
    const result = await signInWithPopup(auth, provider)
    let idToken: string
    try {
      idToken = await result.user.getIdToken()
    } finally {
      // Sign out the wrong-UID session immediately — we'll re-sign in below
      await signOut(auth)
    }

    // 2. Exchange for a custom token that maps to the EXISTING users/{uid} record
    const res = await fetch('/.netlify/functions/google-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    })
    const data = (await res.json()) as { token?: string; error?: string }
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? 'שגיאה בכניסה עם Google')
    }

    // 3. Sign in with the correct UID
    await signInWithCustomToken(auth, data.token)
  }

  const logOut = async () => {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{
        firebaseUser, appUser, orgRoles, orgRole: orgRoles[0] ?? null,
        access, isManager: isManagerUser(appUser), domain,
        rolesReady: !!appUser && loadedKey === roleIdsKey,
        loading, authError, signIn, signInWithGoogle, logOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
