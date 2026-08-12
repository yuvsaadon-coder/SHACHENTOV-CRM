import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQKnowledgeItem, HQKnowledgeCategory, Domain } from '../types'

export function useHQKnowledge(domainFilter?: Domain | 'all' | null) {
  const [items, setItems] = useState<HQKnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = domainFilter && domainFilter !== 'all'
      ? query(
          collection(db, 'hq_knowledge'),
          where('domain', 'in', [domainFilter, 'all'])
        )
      : query(collection(db, 'hq_knowledge'))

    return onSnapshot(
      q,
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as HQKnowledgeItem))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? 0
            const tb = b.createdAt?.toMillis?.() ?? 0
            return tb - ta
          })
        setItems(sorted)
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [domainFilter])

  return { items, loading }
}

export function useAddHQKnowledge() {
  const { appUser } = useAuth()

  const addItem = async (data: {
    domain: Domain | 'all'
    category: HQKnowledgeCategory
    title: string
    content: string
    fileUrl?: string
    fileName?: string
    tags: string[]
  }) => {
    await addDoc(collection(db, 'hq_knowledge'), {
      ...data,
      createdBy: appUser?.name ?? appUser?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  return { addItem }
}
