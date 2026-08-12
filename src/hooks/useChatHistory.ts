import { useState, useEffect, useCallback } from 'react'
import { collection, addDoc, updateDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSession {
  id: string
  title: string
  type: 'portal' | 'hq'
  branchId?: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

export function useChatHistory(
  userId: string | undefined,
  type: 'portal' | 'hq',
  branchId?: string,
) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const collPath = userId ? `users/${userId}/chatSessions` : null

  useEffect(() => {
    if (!collPath) { setLoading(false); return }
    const q = query(collection(db, collPath), orderBy('updatedAt', 'desc'), limit(15))
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          title: (data.title as string | undefined) ?? 'שיחה',
          type: (data.type as 'portal' | 'hq'),
          branchId: data.branchId as string | undefined,
          messages: (data.messages as ChatMessage[] | undefined) ?? [],
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
        } satisfies ChatSession
      })
      setSessions(all.filter((s) => s.type === type && (branchId ? s.branchId === branchId : true)))
      setLoading(false)
    }, () => setLoading(false))
  }, [collPath, type, branchId])

  const saveSession = useCallback(async (messages: ChatMessage[]) => {
    if (!collPath || messages.length === 0) return
    const title = messages[0]?.content.slice(0, 60) ?? 'שיחה'

    if (currentSessionId) {
      await updateDoc(doc(db, collPath, currentSessionId), {
        messages,
        updatedAt: serverTimestamp(),
      })
    } else {
      const ref = await addDoc(collection(db, collPath), {
        type,
        branchId: branchId ?? null,
        title,
        messages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setCurrentSessionId(ref.id)
    }
  }, [collPath, type, branchId, currentSessionId])

  const startNewSession = useCallback(() => {
    setCurrentSessionId(null)
  }, [])

  const loadSession = useCallback((session: ChatSession): ChatMessage[] => {
    setCurrentSessionId(session.id)
    return session.messages
  }, [])

  return { sessions, loading, saveSession, startNewSession, loadSession, currentSessionId }
}
