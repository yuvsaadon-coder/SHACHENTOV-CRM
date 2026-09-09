import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { normalizeKnowledgeDocument, type HQKnowledgeMutationItem } from '../lib/hqKnowledgeSchema'
import { useAuth } from '../context/AuthContext'
import type { Domain, HQKnowledgeCategory, HQKnowledgeItem } from '../types'

interface MutationResponse {
  error?: string
  operationApplied?: boolean
}

interface HQKnowledgeInput {
  domain: Domain | 'all'
  category: HQKnowledgeCategory
  title: string
  content: string
  file?: File
  fileUrl?: string
  fileName?: string
  storagePath?: string
  tags: string[]
  visibleToCoordinators?: boolean
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_')
}

async function uploadToStorage(file: File, docId: string) {
  const storagePath = `hq_knowledge/${docId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
  const storageRef = ref(storage, storagePath)
  await uploadBytes(storageRef, file)
  return {
    fileUrl: await getDownloadURL(storageRef),
    fileName: file.name,
    storagePath,
  }
}

async function removeUploadedFile(storagePath: string): Promise<void> {
  await deleteObject(ref(storage, storagePath))
}

async function mutateHQKnowledge(
  token: string,
  request: { operation: 'create' | 'update' | 'delete'; id: string; item?: HQKnowledgeMutationItem },
): Promise<MutationResponse> {
  const result = await fetch('/.netlify/functions/hq-knowledge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  })
  const body = await result.json().catch(() => ({})) as MutationResponse
  if (!result.ok) {
    const error = new Error(body.error || `פעולת מאגר הידע נכשלה (${result.status})`)
    Object.assign(error, { operationApplied: body.operationApplied })
    throw error
  }
  return body
}

function mutationItem(data: HQKnowledgeInput, attachment?: {
  fileUrl: string
  fileName: string
  storagePath?: string
}): HQKnowledgeMutationItem {
  return {
    domain: data.domain,
    category: data.category,
    title: data.title,
    content: data.content,
    tags: data.tags,
    visibleToCoordinators: data.visibleToCoordinators ?? false,
    attachment,
  }
}

export function useHQKnowledge(domainFilter?: Domain | 'all' | null) {
  const [items, setItems] = useState<HQKnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const knowledgeQuery = domainFilter && domainFilter !== 'all'
      ? query(collection(db, 'hq_knowledge'), where('domain', 'in', [domainFilter, 'all']))
      : query(collection(db, 'hq_knowledge'))

    return onSnapshot(
      knowledgeQuery,
      (snapshot) => {
        const sorted = snapshot.docs
          .map((item) => ({
            ...normalizeKnowledgeDocument(item.data()),
            id: item.id,
          } as HQKnowledgeItem))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() ?? 0
            const bTime = b.createdAt?.toMillis?.() ?? 0
            return bTime - aTime
          })
        setItems(sorted)
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [domainFilter])

  return { items, loading }
}

export function useAddHQKnowledge() {
  const { firebaseUser } = useAuth()

  const addItem = async (data: HQKnowledgeInput) => {
    if (!firebaseUser) throw new Error('לא מחובר — התחבר מחדש ונסה שוב.')
    const id = doc(collection(db, 'hq_knowledge')).id
    const uploaded = data.file ? await uploadToStorage(data.file, id) : undefined

    try {
      const token = await firebaseUser.getIdToken()
      await mutateHQKnowledge(token, {
        operation: 'create',
        id,
        item: mutationItem(data, uploaded),
      })
    } catch (error) {
      if (uploaded?.storagePath && (error as { operationApplied?: boolean }).operationApplied === false) {
        try {
          await removeUploadedFile(uploaded.storagePath)
        } catch (cleanupError) {
          const message = error instanceof Error ? error.message : String(error)
          const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          throw new Error(`${message} בנוסף, ניקוי הקובץ שהועלה נכשל: ${cleanupMessage}`)
        }
      }
      throw error
    }
  }

  return { addItem }
}

export function useUpdateHQKnowledge() {
  const { firebaseUser } = useAuth()

  const updateItem = async (id: string, data: HQKnowledgeInput) => {
    if (!firebaseUser) throw new Error('לא מחובר — התחבר מחדש ונסה שוב.')
    const uploaded = data.file ? await uploadToStorage(data.file, id) : undefined
    const retainedAttachment = !data.file && data.fileUrl && data.fileName
      ? { fileUrl: data.fileUrl, fileName: data.fileName, storagePath: data.storagePath }
      : undefined

    try {
      const token = await firebaseUser.getIdToken()
      await mutateHQKnowledge(token, {
        operation: 'update',
        id,
        item: mutationItem(data, uploaded ?? retainedAttachment),
      })
    } catch (error) {
      if (uploaded?.storagePath && (error as { operationApplied?: boolean }).operationApplied === false) {
        try {
          await removeUploadedFile(uploaded.storagePath)
        } catch (cleanupError) {
          const message = error instanceof Error ? error.message : String(error)
          const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          throw new Error(`${message} בנוסף, ניקוי הקובץ שהועלה נכשל: ${cleanupMessage}`)
        }
      }
      throw error
    }
  }

  return { updateItem }
}

export function useDeleteHQKnowledge() {
  const { firebaseUser } = useAuth()

  const deleteItem = async (id: string) => {
    if (!firebaseUser) throw new Error('לא מחובר — התחבר מחדש ונסה שוב.')
    const token = await firebaseUser.getIdToken()
    await mutateHQKnowledge(token, { operation: 'delete', id })
  }

  return { deleteItem }
}
