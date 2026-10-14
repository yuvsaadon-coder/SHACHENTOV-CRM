import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { AppUser, OrgRole } from '../types'

interface AuthContextValue {
  firebaseUser: User | null
  appUser: AppUser | null
  orgRole: OrgRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
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

  const logOut = async () => {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, orgRole, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
