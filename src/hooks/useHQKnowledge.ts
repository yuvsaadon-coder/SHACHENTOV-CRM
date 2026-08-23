import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQKnowledgeItem, HQKnowledgeCategory, Domain } from '../types'

async function uploadToStorage(file: File, docId: string): Promise<{ fileUrl: string; fileName: string }> {
  const storageRef = ref(storage, `hq_knowledge/${docId}/${file.name}`)
  await uploadBytes(storageRef, file)
  const fileUrl = await getDownloadURL(storageRef)
  return { fileUrl, fileName: file.name }
}

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
    file?: File
    tags: string[]
  }) => {
    const { file, ...rest } = data
    // Create the doc first to get its ID, then upload file (if any) using that ID as path prefix
    const docRef = await addDoc(collection(db, 'hq_knowledge'), {
      ...rest,
      createdBy: appUser?.name ?? appUser?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    if (file) {
      const { fileUrl, fileName } = await uploadToStorage(file, docRef.id)
      await updateDoc(docRef, { fileUrl, fileName, updatedAt: serverTimestamp() })
    }
  }

  return { addItem }
}

export function useUpdateHQKnowledge() {
  const updateItem = async (id: string, data: {
    domain: Domain | 'all'
    category: HQKnowledgeCategory
    title: string
    content: string
    file?: File
    fileUrl?: string
    fileName?: string
    tags: string[]
  }) => {
    const { file, ...rest } = data
    if (file) {
      const { fileUrl, fileName } = await uploadToStorage(file, id)
      await updateDoc(doc(db, 'hq_knowledge', id), { ...rest, fileUrl, fileName, updatedAt: serverTimestamp() })
    } else {
      await updateDoc(doc(db, 'hq_knowledge', id), { ...rest, updatedAt: serverTimestamp() })
    }
  }
  return { updateItem }
}

export function useDeleteHQKnowledge() {
  const deleteItem = async (id: string) => {
    await deleteDoc(doc(db, 'hq_knowledge', id))
  }
  return { deleteItem }
}
