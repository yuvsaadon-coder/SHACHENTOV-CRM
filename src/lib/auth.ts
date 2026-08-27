'use client'

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase/client'
import type { AppUser } from '@/types/crm'

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function signOut() {
  return firebaseSignOut(auth)
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return null
    return snap.data() as AppUser
  } catch {
    return null
  }
}

// Retrieve the custom role claim from the ID token
export async function getUserRole(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  const token = await user.getIdTokenResult()
  return (token.claims.role as string) ?? null
}

export async function getUserProgramIds(): Promise<string[]> {
  const user = auth.currentUser
  if (!user) return []
  const token = await user.getIdTokenResult()
  return (token.claims.programIds as string[]) ?? []
}
