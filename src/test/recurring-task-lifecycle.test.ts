import { describe, expect, it } from 'vitest'
import type { TaskFrequency, TaskStatus } from '../types'
import {
  cycleKeyForDate,
  processRecurringTaskPages,
  recurringTaskUpdate,
  type RecurringTaskPageStore,
} from '../utils/recurringTaskLifecycle'

describe('recurring task cycle keys', () => {
  const now = new Date('2026-08-15T09:00:00.000Z')

  it.each<[TaskFrequency, string | null]>([
    ['חד-פעמי', null],
    ['שוטף', '2026-08'],
    ['חודשי', '2026-08'],
    ['רבעוני', '2026-Q3'],
    ['חצי-שנתי', '2026-H2'],
    ['שנתי', '2026'],
    ['לפי חג', '2026'],
  ])('calculates %s', (frequency, expected) => {
    expect(cycleKeyForDate(frequency, now)).toBe(expected)
  })

  it('uses the Israel calendar year at the UTC year boundary', () => {
    const israelNewYear = new Date('2026-12-31T22:30:00.000Z')
    expect(cycleKeyForDate('חודשי', israelNewYear)).toBe('2027-01')
    expect(cycleKeyForDate('רבעוני', israelNewYear)).toBe('2027-Q1')
    expect(cycleKeyForDate('חצי-שנתי', israelNewYear)).toBe('2027-H1')
    expect(cycleKeyForDate('שנתי', israelNewYear)).toBe('2027')
  })
})

describe('recurring task lifecycle updates', () => {
  const now = new Date('2026-08-15T09:00:00.000Z')

  it('advances a stale already-open task without changing its status', () => {
    expect(recurringTaskUpdate({
      frequency: 'חודשי',
      status: 'לא בוצע',
      cycleKey: '2026-07',
    }, now)).toEqual({ cycleKey: '2026-08' })
  })

  it('reopens a stale completed task and advances its cycle', () => {
    expect(recurringTaskUpdate({
      frequency: 'חודשי',
      status: 'בוצע',
      cycleKey: '2026-07',
    }, now)).toEqual({ cycleKey: '2026-08', status: 'לא בוצע' })
  })

  it('preserves a completion that happened concurrently with the reset', () => {
    expect(recurringTaskUpdate({
      frequency: 'חודשי',
      status: 'בוצע',
      cycleKey: '2026-07',
      updatedAt: new Date('2026-08-15T09:00:00.001Z'),
    }, now)).toEqual({ cycleKey: '2026-08' })
  })

  it('bootstraps a keyless task updated in the current cycle without reopening it', () => {
    expect(recurringTaskUpdate({
      frequency: 'חודשי',
      status: 'בוצע',
      updatedAt: new Date('2026-08-02T09:00:00.000Z'),
    }, now)).toEqual({ cycleKey: '2026-08' })
  })

  it('reopens a keyless task last updated in an earlier cycle', () => {
    expect(recurringTaskUpdate({
      frequency: 'חודשי',
      status: 'בוצע',
      updatedAt: new Date('2026-07-31T09:00:00.000Z'),
    }, now)).toEqual({ cycleKey: '2026-08', status: 'לא בוצע' })
  })

  it('does not modify one-time or already-current tasks', () => {
    expect(recurringTaskUpdate({
      frequency: 'חד-פעמי',
      status: 'בוצע',
    }, now)).toBeNull()
    expect(recurringTaskUpdate({
      frequency: 'רבעוני',
      status: 'בוצע',
      cycleKey: '2026-Q3',
    }, now)).toBeNull()
  })
})

describe('recurring task pagination', () => {
  it('processes more than 500 tasks in bounded pages', async () => {
    const tasks = new Map<string, {
      frequency: TaskFrequency
      status: TaskStatus
      cycleKey: string
    }>()
    for (let index = 0; index < 901; index += 1) {
      const id = String(index).padStart(4, '0')
      tasks.set(id, {
        frequency: 'חודשי',
        status: 'בוצע',
        cycleKey: '2026-07',
      })
    }

    const pageSizes: number[] = []
    const store: RecurringTaskPageStore = {
      async listTaskIds(afterId, limit) {
        const ids = [...tasks.keys()].filter((id) => !afterId || id > afterId)
        return ids.slice(0, limit)
      },
      async applyPage(taskIds, now) {
        pageSizes.push(taskIds.length)
        let updated = 0
        for (const id of taskIds) {
          const task = tasks.get(id)!
          const update = recurringTaskUpdate(task, now)
          if (update) {
            tasks.set(id, { ...task, ...update })
            updated += 1
          }
        }
        return { scanned: taskIds.length, updated }
      },
    }

    const result = await processRecurringTaskPages(
      store,
      new Date('2026-08-15T09:00:00.000Z'),
      400,
    )

    expect(pageSizes).toEqual([400, 400, 101])
    expect(result).toEqual({ pages: 3, scanned: 901, updated: 901 })
    expect(Math.max(...pageSizes)).toBeLessThanOrEqual(500)
  })
})
