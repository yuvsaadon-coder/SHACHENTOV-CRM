import { useEffect, useRef } from 'react'
import { doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Task, TaskFrequency } from '../types'

/**
 * Returns the cycle key for the current date based on task frequency.
 * The key encodes which period the task should be fresh for:
 *   חד-פעמי  → null  (never auto-resets)
 *   שוטף/חודשי → "2026-08"
 *   רבעוני    → "2026-Q3"
 *   חצי-שנתי  → "2026-H2"
 *   שנתי/לפי חג → "2026"
 */
export function currentCycleKey(frequency: TaskFrequency): string | null {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  switch (frequency) {
    case 'חד-פעמי':
      return null
    case 'שוטף':
    case 'חודשי':
      return `${y}-${String(m + 1).padStart(2, '0')}`
    case 'רבעוני':
      return `${y}-Q${Math.floor(m / 3) + 1}`
    case 'חצי-שנתי':
      return `${y}-H${m < 6 ? 1 : 2}`
    case 'שנתי':
    case 'לפי חג':
      return `${y}`
    default:
      return null
  }
}

/**
 * Advance a Timestamp's year to targetYear, keeping month/day/time intact.
 * Returns null if the input is null/undefined.
 * Used to keep recurring task dates current without changing their seasonal slot.
 */
function advanceYear(ts: Timestamp | null | undefined, targetYear: number): Timestamp | null {
  if (!ts) return null
  const d = ts.toDate()
  d.setFullYear(targetYear)
  return Timestamp.fromDate(d)
}

/**
 * For recurring tasks whose dates fall in a past year, compute updated
 * startDate/endDate fields anchored to the current cycle's year.
 * Holiday-anchored tasks (לפי חג) are skipped — their Hebrew-calendar
 * dates shift in ways we can't compute automatically.
 */
function advancedDates(t: Task): { startDate?: Timestamp | null; endDate?: Timestamp | null } {
  if (t.frequency === 'לפי חג' || t.frequency === 'חד-פעמי') return {}

  const now = new Date()
  const currentYear = now.getFullYear()

  const startYear = t.startDate ? t.startDate.toDate().getFullYear() : null
  const endYear   = t.endDate   ? t.endDate.toDate().getFullYear()   : null

  const needsAdvance = (startYear !== null && startYear < currentYear) ||
                       (endYear   !== null && endYear   < currentYear)

  if (!needsAdvance) return {}

  return {
    startDate: advanceYear(t.startDate, currentYear),
    endDate:   advanceYear(t.endDate,   currentYear),
  }
}

/**
 * Call this hook (admin-only) wherever tasks are loaded.
 * On each load it checks recurring tasks for a cycle rollover and
 * batch-resets them to "לא בוצע" in Firestore if needed.
 * It also advances startDate/endDate to the current year for annual tasks.
 * The reset is idempotent: running it twice in the same cycle is a no-op.
 */
export function useRecurringTaskReset(tasks: Task[], isAdmin: boolean) {
  // Track which task IDs we've already reset this session to avoid re-firing
  // when the Firestore listener pushes the freshly-updated docs back.
  const resetInSession = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isAdmin || tasks.length === 0) return

    const toReset = tasks.filter((t) => {
      if (resetInSession.current.has(t.id)) return false
      const key = currentCycleKey(t.frequency)
      if (!key) return false
      // Reset if the stored cycleKey is outdated AND the task isn't already fresh
      return t.cycleKey !== key && t.status !== 'לא בוצע'
    })

    // Also collect tasks that only need date advancement (already 'לא בוצע' but dates are stale)
    const toAdvanceDatesOnly = tasks.filter((t) => {
      if (resetInSession.current.has(t.id)) return false
      const key = currentCycleKey(t.frequency)
      if (!key) return false
      if (t.cycleKey !== key && t.status !== 'לא בוצע') return false // handled by toReset
      const dates = advancedDates(t)
      return dates.startDate !== undefined || dates.endDate !== undefined
    })

    if (toReset.length === 0 && toAdvanceDatesOnly.length === 0) return

    const batch = writeBatch(db)
    const now = serverTimestamp()

    for (const t of toReset) {
      const key = currentCycleKey(t.frequency)!
      batch.update(doc(db, 'tasks', t.id), {
        status: 'לא בוצע',
        cycleKey: key,
        updatedAt: now,
        ...advancedDates(t),
      })
      resetInSession.current.add(t.id)
    }

    for (const t of toAdvanceDatesOnly) {
      const dates = advancedDates(t)
      if (!dates.startDate && !dates.endDate) continue
      batch.update(doc(db, 'tasks', t.id), { ...dates, updatedAt: now })
      resetInSession.current.add(t.id)
    }

    void batch.commit()
  }, [tasks, isAdmin])
}
