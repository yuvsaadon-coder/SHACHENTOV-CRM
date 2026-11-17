import { useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import type { Shift } from '../types'

export function useShifts(branchId: string, month: string) {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId || !month) return
    const q = query(
      collection(db, 'shifts'),
      where('branchId', '==', branchId),
      where('month', '==', month),
      orderBy('date'),
      orderBy('startTime'),
    )
    return onSnapshot(q, (snap) => {
      setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Shift)))
      setLoading(false)
    })
  }, [branchId, month])

  return { shifts, loading }
}

export function useAddShift(branchId: string) {
  const { firebaseUser } = useAuth()
  return async (data: Omit<Shift, 'id' | 'createdAt' | 'updatedAt'>) => {
    await addDoc(collection(db, 'shifts'), {
      ...data,
      branchId,
      createdBy: firebaseUser?.uid ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export function useUpdateShift() {
  return async (id: string, data: Partial<Shift>) => {
    await updateDoc(doc(db, 'shifts', id), { ...data, updatedAt: serverTimestamp() })
  }
}

export function useDeleteShift() {
  return async (id: string) => {
    await deleteDoc(doc(db, 'shifts', id))
  }
}

/** Duplicate all shifts from a source month into a target month. */
export function useDuplicateMonth(branchId: string) {
  const { firebaseUser } = useAuth()
  return async (sourceShifts: Shift[], targetMonth: string) => {
    // Derive year/month offset
    const [sy, sm] = sourceShifts[0]?.month.split('-').map(Number) ?? [0, 0]
    const [ty, tm] = targetMonth.split('-').map(Number)
    const dayOffset = new Date(ty, tm - 1, 1).getDay() - new Date(sy, sm - 1, 1).getDay()

    const batch = writeBatch(db)
    for (const s of sourceShifts) {
      const srcDate = new Date(s.date)
      // Simple: keep same day-of-month, adjust month/year
      const dateStr = `${ty}-${String(tm).padStart(2,'0')}-${String(srcDate.getDate()).padStart(2,'0')}`
      const ref = doc(collection(db, 'shifts'))
      batch.set(ref, {
        branchId,
        month: targetMonth,
        date: dateStr,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
        capacity: s.capacity,
        notes: s.notes ?? null,
        status: 'open',
        createdBy: firebaseUser?.uid ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    // suppress unused variable warning
    void dayOffset
    await batch.commit()
  }
}
