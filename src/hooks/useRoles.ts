import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { OrgRole } from '../types'

export function useRoles() {
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'roles'), orderBy('level'))
    return onSnapshot(
      q,
      (snap) => {
        setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrgRole)))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
  }, [])

  return { roles, loading, error }
}

export function applyDelegation(role: OrgRole): OrgRole {
  if (role.level === 'מטה' && role.status === 'חסר' && !role.delegatedTo) {
    return { ...role, delegatedTo: 'מנכ"ל (יובל)' }
  }
  return role
}
