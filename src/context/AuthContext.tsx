import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, type User } from 'firebase/auth'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { AppUser, OrgRole } from '../types'

interface AuthContextValue {
  firebaseUser: User | null
  appUser: AppUser | null
  orgRole: OrgRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  logOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid))
          if (snap.exists()) {
            setAppUser({ uid: user.uid, ...snap.data() } as AppUser)
          }
          // Fetch linked OrgRole by uid
          const rolesSnap = await getDocs(
            query(collection(db, 'roles'), where('uid', '==', user.uid))
          )
          if (!rolesSnap.empty) {
            setOrgRole({ id: rolesSnap.docs[0].id, ...rolesSnap.docs[0].data() } as OrgRole)
          } else {
            setOrgRole(null)
          }
        } catch {
          // Firestore permissions error — still unblock the loading state
        }
      } else {
        setAppUser(null)
        setOrgRole(null)
      }
      setLoading(false)
    })
  }, [])

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)
    // Verify the Google user exists in our users collection
    const snap = await getDoc(doc(db, 'users', result.user.uid))
    if (!snap.exists()) {
      await signOut(auth)
      throw new Error('המשתמש אינו מורשה למערכת. פנה למנהל המערכת.')
    }
  }

  const logOut = async () => {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, orgRole, loading, signIn, signInWithGoogle, logOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
