import { useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { VolunteerMember } from '../types'
import { randomToken } from '../lib/volunteerUtils'

export function useVolunteerMembers(branchId: string) {
  const [volunteers, setVolunteers] = useState<VolunteerMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId) return
    const q = query(
      collection(db, 'volunteers'),
      where('branchIds', 'array-contains', branchId),
      orderBy('name'),
    )
    return onSnapshot(q, (snap) => {
      setVolunteers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as VolunteerMember)))
      setLoading(false)
    })
  }, [branchId])

  return { volunteers, loading }
}

export function useAddVolunteerMember(branchId: string) {
  return async (data: { name: string; phone: string; tags: string[] }) => {
    const token = randomToken()
    const batch = writeBatch(db)
    const volRef = doc(collection(db, 'volunteers'))
    batch.set(volRef, {
      name: data.name,
      phone: normalizePhone(data.phone),
      branchIds: [branchId],
      tags: data.tags,
      status: 'active',
      optOut: false,
      tokens: { [branchId]: token },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    // create lookup token doc
    batch.set(doc(db, 'volunteer_tokens', token), {
      volunteerId: volRef.id,
      branchId,
      active: true,
    })
    await batch.commit()
    return volRef.id
  }
}

export function useUpdateVolunteerMember() {
  return async (id: string, data: Partial<VolunteerMember>) => {
    await updateDoc(doc(db, 'volunteers', id), { ...data, updatedAt: serverTimestamp() })
  }
}

/** Re-generate token for a volunteer+branch (invalidates old link). */
export function useRegenerateToken() {
  return async (volunteerId: string, branchId: string, oldToken: string) => {
    const newToken = randomToken()
    const batch = writeBatch(db)
    // deactivate old token
    batch.update(doc(db, 'volunteer_tokens', oldToken), { active: false })
    // create new token
    batch.set(doc(db, 'volunteer_tokens', newToken), { volunteerId, branchId, active: true })
    // update volunteer doc
    batch.update(doc(db, 'volunteers', volunteerId), {
      [`tokens.${branchId}`]: newToken,
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
    return newToken
  }
}

/** Bulk-import volunteers from parsed CSV rows. */
export function useImportVolunteers(branchId: string) {
  return async (rows: { name: string; phone: string; tags: string[] }[]) => {
    const batch = writeBatch(db)
    for (const row of rows) {
      const token = randomToken()
      const volRef = doc(collection(db, 'volunteers'))
      batch.set(volRef, {
        name: row.name,
        phone: normalizePhone(row.phone),
        branchIds: [branchId],
        tags: row.tags,
        status: 'active',
        optOut: false,
        tokens: { [branchId]: token },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      batch.set(doc(db, 'volunteer_tokens', token), {
        volunteerId: volRef.id,
        branchId,
        active: true,
      })
    }
    await batch.commit()
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('972')) return `+${digits}`
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`
  return `+972${digits}`
}
