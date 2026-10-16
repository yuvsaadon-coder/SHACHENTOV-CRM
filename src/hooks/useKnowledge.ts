import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { KnowledgeItem, KnowledgeItemType } from '../types'
import { useAuth } from '../context/AuthContext'

export function useKnowledge(branchId: string | null) {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId) { setLoading(false); return }
    const q = query(
      collection(db, 'knowledgeItems'),
      where('branchId', 'in', [branchId, 'global'])
    )
    return onSnapshot(
      q,
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as KnowledgeItem))
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
  }, [branchId])

  return { items, loading }
}

export function useAddKnowledge() {
  const { appUser } = useAuth()

  const addItem = async (data: {
    branchId: string
    type: KnowledgeItemType
    title: string
    content: string
    url?: string
    fileUrl?: string
    fileName?: string
    fileSize?: number
    checklistItems?: string[]
    tags: string[]
  }) => {
    await addDoc(collection(db, 'knowledgeItems'), {
      ...data,
      createdBy: appUser?.uid ?? '',
      createdAt: serverTimestamp(),
    })
  }

  return { addItem }
}

export function useUpdateKnowledge() {
  const updateItem = async (id: string, data: {
    type: KnowledgeItemType
    title: string
    content: string
    url?: string
    fileUrl?: string
    fileName?: string
    fileSize?: number
    checklistItems?: string[]
    tags: string[]
  }) => {
    await updateDoc(doc(db, 'knowledgeItems', id), { ...data })
  }
  return { updateItem }
}

export function useDeleteKnowledge() {
  const deleteItem = async (id: string) => {
    await deleteDoc(doc(db, 'knowledgeItems', id))
  }
  return { deleteItem }
}
