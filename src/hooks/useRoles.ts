import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { OrgRole, StoredOrgRole } from '../types'
import { attachHolders } from '../lib/peopleLogic'
import { usePeople } from './usePeople'

/**
 * Positions with their holders. Holders are not stored on the role — they are
 * the people whose `roleIds` include it, joined here on every change.
 */
export function useRoles() {
  const [stored, setStored] = useState<(StoredOrgRole & { id: string })[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const { people, loading: peopleLoading, error: peopleError } = usePeople()

  useEffect(() => {
    const q = query(collection(db, 'roles'), orderBy('level'))
    return onSnapshot(
      q,
      (snap) => {
        setStored(snap.docs.map((d) => ({ ...d.data(), id: d.id } as StoredOrgRole & { id: string })))
        setRolesLoading(false)
      },
      (err) => {
        setRolesError(err.message)
        setRolesLoading(false)
      }
    )
  }, [])

  const roles = useMemo(() => attachHolders(stored, people), [stored, people])

  return {
    roles,
    people,
    loading: rolesLoading || peopleLoading,
    error: rolesError ?? peopleError,
  }
}

export function applyDelegation(role: OrgRole): OrgRole {
  if (role.level === 'מטה' && role.status === 'חסר' && !role.delegatedTo) {
    return { ...role, delegatedTo: 'מנכ"ל' }
  }
  return role
}
