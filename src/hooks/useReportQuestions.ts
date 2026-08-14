import { useEffect, useMemo, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { ReportQuestion } from '../types'

/**
 * All report questions for one branch type, ordered for rendering.
 * Sorted client-side (matches useKnowledge/useHQKnowledge/useQuarterlyReports)
 * rather than via a Firestore `orderBy` — combining an equality `where` with
 * `orderBy` on a different field needs a composite index that doesn't exist,
 * which would otherwise fail silently for every coordinator opening the form.
 */
export function useReportQuestions(branchType: 'food' | 'cafe_youth') {
  const [questions, setQuestions] = useState<ReportQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'reportQuestions'), where('branchType', '==', branchType))
    return onSnapshot(
      q,
      (snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ReportQuestion))
          .sort((a, b) => a.order - b.order)
        setQuestions(sorted)
        setLoading(false)
      },
      (err) => { setError(err.message); setLoading(false) }
    )
  }, [branchType])

  return { questions, loading, error }
}

/** Every question, both branch types — used to label saved report fields anywhere in the CRM. */
export function useAllReportQuestions() {
  const [questions, setQuestions] = useState<ReportQuestion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'reportQuestions'),
      (snap) => {
        setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReportQuestion)))
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [])

  const labelByKey = useMemo(
    () => Object.fromEntries(questions.map((q) => [q.key, q.label])),
    [questions]
  )

  return { questions, labelByKey, loading }
}

export function useReportQuestionAdmin() {
  const create = (data: Omit<ReportQuestion, 'id'>) =>
    addDoc(collection(db, 'reportQuestions'), data)

  const update = (id: string, data: Partial<Omit<ReportQuestion, 'id'>>) =>
    updateDoc(doc(db, 'reportQuestions', id), data)

  const remove = (id: string) => deleteDoc(doc(db, 'reportQuestions', id))

  const reorder = async (id: string, order: number) => update(id, { order })

  return { create, update, remove, reorder }
}
