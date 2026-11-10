import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { Branch } from '../types'

/** The portal branches of the signed-in coordinator — those of the positions they hold. */
export function useBranch() {
  const { appUser } = useAuth()
  // null = the branch document is missing or unreadable
  const [loaded, setLoaded] = useState<Record<string, Branch | null>>({})
  const key = (appUser?.branchIds ?? []).join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, 'branches', id),
        (snap) => setLoaded((prev) => ({ ...prev, [id]: snap.exists() ? ({ id, ...snap.data() } as Branch) : null })),
        () => setLoaded((prev) => ({ ...prev, [id]: null })),
      ))
    return () => unsubs.forEach((u) => u())
  }, [key])

  const ids = key ? key.split(',') : []
  const branches = ids.map((id) => loaded[id]).filter((b): b is Branch => !!b)
  return { branches, loading: !appUser || ids.some((id) => !(id in loaded)) }
}

export function useAllBranches() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'branches'),
      (snap) => {
        setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Branch)))
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [])

  return { branches, loading }
}
