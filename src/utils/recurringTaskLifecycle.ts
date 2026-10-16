import type { TaskFrequency, TaskStatus } from '../types'

export const RECURRING_TASK_TIME_ZONE = 'Asia/Jerusalem'
export const RECURRING_TASK_PAGE_SIZE = 400

type RecurringTaskState = {
  frequency?: TaskFrequency
  status?: TaskStatus
  cycleKey?: string
  updatedAt?: Date | { toDate(): Date }
}

export type RecurringTaskUpdate = {
  cycleKey: string
  status?: TaskStatus
}

export interface RecurringTaskPageStore {
  listTaskIds(afterId: string | null, limit: number): Promise<string[]>
  applyPage(taskIds: string[], now: Date): Promise<{ scanned: number; updated: number }>
}

export function cycleKeyForDate(
  frequency: TaskFrequency,
  now: Date,
  timeZone = RECURRING_TASK_TIME_ZONE,
): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = Number(parts.find((part) => part.type === 'month')?.value)

  if (!year || !month) throw new Error('Unable to calculate recurring task cycle')

  switch (frequency) {
    case 'חד-פעמי':
      return null
    case 'שוטף':
    case 'חודשי':
      return `${year}-${String(month).padStart(2, '0')}`
    case 'רבעוני':
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`
    case 'חצי-שנתי':
      return `${year}-H${month <= 6 ? 1 : 2}`
    case 'שנתי':
    case 'לפי חג':
      return year
  }
}

export function recurringTaskUpdate(
  task: RecurringTaskState,
  now: Date,
): RecurringTaskUpdate | null {
  if (!task.frequency) return null

  const cycleKey = cycleKeyForDate(task.frequency, now)
  if (!cycleKey || task.cycleKey === cycleKey) return null

  const updatedAt = task.updatedAt instanceof Date
    ? task.updatedAt
    : task.updatedAt?.toDate()
  const changedDuringRun = updatedAt ? updatedAt.getTime() >= now.getTime() : false
  const initializedInCurrentCycle = !task.cycleKey && updatedAt
    ? cycleKeyForDate(task.frequency, updatedAt) === cycleKey
    : false

  return task.status === 'לא בוצע' || changedDuringRun || initializedInCurrentCycle
    ? { cycleKey }
    : { cycleKey, status: 'לא בוצע' }
}

export async function processRecurringTaskPages(
  store: RecurringTaskPageStore,
  now: Date,
  pageSize = RECURRING_TASK_PAGE_SIZE,
): Promise<{ pages: number; scanned: number; updated: number }> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error('Recurring task page size must be between 1 and 500')
  }

  let afterId: string | null = null
  let pages = 0
  let scanned = 0
  let updated = 0

  while (true) {
    const taskIds = await store.listTaskIds(afterId, pageSize)
    if (taskIds.length === 0) break

    const pageResult = await store.applyPage(taskIds, now)
    pages += 1
    scanned += pageResult.scanned
    updated += pageResult.updated
    afterId = taskIds[taskIds.length - 1]

    if (taskIds.length < pageSize) break
  }

  return { pages, scanned, updated }
}
