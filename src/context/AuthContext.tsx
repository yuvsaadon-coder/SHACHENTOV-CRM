'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { type User } from 'firebase/auth'
import { onAuthChange, getUserProfile } from '@/lib/auth'
import type { AppUser } from '@/types/crm'

interface AuthContextValue {
  user: User | null
  appUser: AppUser | null
  loading: boolean
  isSuperAdmin: boolean
  isProgramManager: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  appUser: null,
  loading: true,
  isSuperAdmin: false,
  isProgramManager: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthChange(async firebaseUser => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const profile = await getUserProfile(firebaseUser.uid)
        setAppUser(profile)
      } else {
        setAppUser(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        loading,
        isSuperAdmin: appUser?.role === 'SuperAdmin',
        isProgramManager: appUser?.role === 'ProgramManager',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
