import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { HQKnowledgeItem, HQKnowledgeCategory, Domain } from '../types'

async function syncToCoordinators(docId: string, title: string, content: string, storageUrl?: string) {
  await setDoc(doc(db, 'knowledgeItems', `hq-${docId}`), {
    branchId: 'global',
    type: 'document',
    title,
    content,
    storageUrl: storageUrl ?? null,
    sourceHQId: docId,
    createdAt: new Date().toISOString(),
  }, { merge: true })
}

async function removeFromCoordinators(docId: string) {
  await deleteDoc(doc(db, 'knowledgeItems', `hq-${docId}`))
}

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
    visibleToCoordinators?: boolean
  }) => {
    const { file, visibleToCoordinators, ...rest } = data
    const docRef = await addDoc(collection(db, 'hq_knowledge'), {
      ...rest,
      visibleToCoordinators: visibleToCoordinators ?? false,
      createdBy: appUser?.name ?? appUser?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    let fileUrl: string | undefined
    if (file) {
      const uploaded = await uploadToStorage(file, docRef.id)
      fileUrl = uploaded.fileUrl
      await updateDoc(docRef, { fileUrl: uploaded.fileUrl, fileName: uploaded.fileName, updatedAt: serverTimestamp() })
    }
    if (visibleToCoordinators) {
      await syncToCoordinators(docRef.id, data.title, data.content, fileUrl)
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
    visibleToCoordinators?: boolean
  }) => {
    const { file, visibleToCoordinators, ...rest } = data
    let fileUrl = rest.fileUrl
    if (file) {
      const uploaded = await uploadToStorage(file, id)
      fileUrl = uploaded.fileUrl
      await updateDoc(doc(db, 'hq_knowledge', id), { ...rest, fileUrl: uploaded.fileUrl, fileName: uploaded.fileName, visibleToCoordinators: visibleToCoordinators ?? false, updatedAt: serverTimestamp() })
    } else {
      await updateDoc(doc(db, 'hq_knowledge', id), { ...rest, visibleToCoordinators: visibleToCoordinators ?? false, updatedAt: serverTimestamp() })
    }
    if (visibleToCoordinators) {
      await syncToCoordinators(id, data.title, data.content, fileUrl)
    } else {
      try { await removeFromCoordinators(id) } catch { /* doc may not exist */ }
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
