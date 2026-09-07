// TEST-R03 — admin-mount recurrence + clock advance (V; G).
// Per TEST-PLAN.md §6 R03:
//   GIVEN a mounted admin hook resets a monthly task and it is completed
//   again; WHEN clock advances another month and a tasks snapshot arrives
//   without unmount; THEN new cycle can reset again.
// This is a firm requirement: the second cycle rollover must reset within
// the same mount (no unmount required). The test asserts that directly and
// reports the actual result.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const { buildFirestoreMock } = await import('../../support/core-firestore-mock')
  return buildFirestoreMock(actual)
})

import { firestoreMock } from '../../support/core-firestore-mock'
import { useRecurringTaskReset } from '../../../../src/hooks/useRecurringTaskReset'
import type { Task } from '../../../../src/types'

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'frequency' | 'status'>): Task {
  return {
    domain: 'FIN',
    title: overrides.id,
    description: '',
    createdAt: null as unknown as Task['createdAt'],
    updatedAt: null as unknown as Task['updatedAt'],
    ...overrides,
  } as Task
}

describe('TEST-R03 admin-mount recurrence with clock advance (G)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('TEST-R03.second-cycle-resets-without-unmount', () => {
    // ── First cycle: September 2026, task stale at 2026-08 → resets. ──
    vi.setSystemTime(new Date('2026-09-06T12:00:00'))
    const staleAug = makeTask({
      id: 'task-monthly',
      frequency: 'חודשי',
      status: 'בעבודה',
      cycleKey: '2026-08',
    })

    const { rerender } = renderHook(
      ({ tasks }: { tasks: Task[] }) => useRecurringTaskReset(tasks, true),
      { initialProps: { tasks: [staleAug] } }
    )

    expect(firestoreMock.batchCommits).toHaveLength(1)
    expect(firestoreMock.batchCommits[0][0].path).toBe('tasks/task-monthly')
    expect((firestoreMock.batchCommits[0][0].data as Record<string, unknown>).cycleKey).toBe(
      '2026-09'
    )

    // Listener echoes the just-written doc back: same-cycle rerender is a no-op.
    const echoedSep = makeTask({
      id: 'task-monthly',
      frequency: 'חודשי',
      status: 'לא בוצע',
      cycleKey: '2026-09',
    })
    rerender({ tasks: [echoedSep] })
    expect(firestoreMock.batchCommits).toHaveLength(1)

    // ── Admin marks the task done again inside the same mount. ──
    const completedSep = makeTask({
      id: 'task-monthly',
      frequency: 'חודשי',
      status: 'בוצע',
      cycleKey: '2026-09',
    })
    rerender({ tasks: [completedSep] })
    expect(firestoreMock.batchCommits).toHaveLength(1)

    // ── Clock advances a month; task's cycleKey (2026-09) is now stale
    //    against currentCycleKey('חודשי') === '2026-10'. Requirement: the
    //    new cycle must reset again without requiring an unmount. ──
    vi.setSystemTime(new Date('2026-10-06T12:00:00'))
    rerender({ tasks: [completedSep] })

    expect(firestoreMock.batchCommits).toHaveLength(2)
    expect((firestoreMock.batchCommits[1][0].data as Record<string, unknown>).cycleKey).toBe('2026-10')
  })

  it('TEST-R03.second-cycle-resets-after-remount', () => {
    // Complement: unmounting drops resetInSession, and a fresh mount at
    // the new clock DOES reset the newly stale task. This proves the
    // suppression above is exactly the mount-scoped session set, not a
    // property of the task fixture itself.
    vi.setSystemTime(new Date('2026-09-06T12:00:00'))
    const stale = makeTask({
      id: 'task-monthly',
      frequency: 'חודשי',
      status: 'בעבודה',
      cycleKey: '2026-08',
    })
    const first = renderHook(() => useRecurringTaskReset([stale], true))
    expect(firestoreMock.batchCommits).toHaveLength(1)
    first.unmount()

    vi.setSystemTime(new Date('2026-10-06T12:00:00'))
    const staleAgain = makeTask({
      id: 'task-monthly',
      frequency: 'חודשי',
      status: 'בוצע',
      cycleKey: '2026-09',
    })
    renderHook(() => useRecurringTaskReset([staleAgain], true))
    expect(firestoreMock.batchCommits).toHaveLength(2)
    expect((firestoreMock.batchCommits[1][0].data as Record<string, unknown>).cycleKey).toBe(
      '2026-10'
    )
  })
})
