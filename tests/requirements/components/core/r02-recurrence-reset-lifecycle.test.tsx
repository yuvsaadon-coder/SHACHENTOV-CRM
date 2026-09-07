// TEST-R02 — recurrence reset lifecycle (V+R; C).
// Baseline: src/hooks/useRecurringTaskReset.ts. isAdmin guard, session
// suppression, and per-task cycleKey/status inspection are the real code
// paths exercised here. Only the Firestore SDK boundary is mocked.
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

// Minimal Task fixtures — only the fields the hook actually reads
// (id, frequency, cycleKey, status). Cast to Task since the hook only
// destructures those fields at runtime.
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

const STALE_MONTHLY = makeTask({
  id: 'task-stale-monthly',
  frequency: 'חודשי',
  status: 'בעבודה',
  cycleKey: '2026-08',
})

const FRESH_MONTHLY = makeTask({
  id: 'task-fresh-monthly',
  frequency: 'חודשי',
  status: 'בעבודה',
  cycleKey: '2026-09',
})

const ALREADY_NOT_DONE = makeTask({
  id: 'task-already-not-done',
  frequency: 'חודשי',
  status: 'לא בוצע',
  cycleKey: '2026-08',
})

const ONE_OFF = makeTask({
  id: 'task-one-off',
  frequency: 'חד-פעמי',
  status: 'בעבודה',
  cycleKey: undefined,
})

describe('TEST-R02 useRecurringTaskReset lifecycle', () => {
  beforeEach(() => {
    firestoreMock.reset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('TEST-R02.stale-recurring-task-resets', () => {
    renderHook(({ tasks, isAdmin }) => useRecurringTaskReset(tasks, isAdmin), {
      initialProps: { tasks: [STALE_MONTHLY], isAdmin: true },
    })
    expect(firestoreMock.batchCommits).toHaveLength(1)
    const ops = firestoreMock.batchCommits[0]
    expect(ops).toHaveLength(1)
    expect(ops[0].kind).toBe('update')
    expect(ops[0].path).toBe('tasks/task-stale-monthly')
    const data = ops[0].data as Record<string, unknown>
    expect(data.status).toBe('לא בוצע')
    expect(data.cycleKey).toBe('2026-09')
    // updatedAt is the mocked serverTimestamp sentinel.
    expect(data.updatedAt).toEqual({ __type: 'serverTimestamp' })
  })

  it('TEST-R02.fresh-recurring-task-not-rewritten', () => {
    renderHook(() => useRecurringTaskReset([FRESH_MONTHLY], true))
    expect(firestoreMock.batchCommits).toHaveLength(0)
    expect(firestoreMock.writeCalls).toHaveLength(0)
  })

  it('TEST-R02.already-not-done-task-not-rewritten', () => {
    // Guard: t.status !== 'לא בוצע' — an already-fresh (not-done) task
    // must not be re-reset even though its cycleKey is stale.
    renderHook(() => useRecurringTaskReset([ALREADY_NOT_DONE], true))
    expect(firestoreMock.batchCommits).toHaveLength(0)
    expect(firestoreMock.writeCalls).toHaveLength(0)
  })

  it('TEST-R02.one-off-never-resets', () => {
    // currentCycleKey('חד-פעמי') === null → `if (!key) return false` guard.
    renderHook(() => useRecurringTaskReset([ONE_OFF], true))
    expect(firestoreMock.batchCommits).toHaveLength(0)
    expect(firestoreMock.writeCalls).toHaveLength(0)
  })

  it('TEST-R02.hq-no-write-control', () => {
    // Same stale fixture — with isAdmin=false the hook must not write.
    renderHook(() => useRecurringTaskReset([STALE_MONTHLY], false))
    expect(firestoreMock.batchCommits).toHaveLength(0)
    expect(firestoreMock.writeCalls).toHaveLength(0)
  })

  it('TEST-R02.same-cycle-rerender-no-duplicate-write', () => {
    const { rerender } = renderHook(
      ({ tasks }: { tasks: Task[] }) => useRecurringTaskReset(tasks, true),
      { initialProps: { tasks: [STALE_MONTHLY] } }
    )
    expect(firestoreMock.batchCommits).toHaveLength(1)

    // Listener echoes back a snapshot where the task is already reset —
    // resetInSession.current must suppress a second write.
    const echoed = makeTask({
      id: 'task-stale-monthly',
      frequency: 'חודשי',
      status: 'לא בוצע',
      cycleKey: '2026-09',
    })
    rerender({ tasks: [echoed] })
    expect(firestoreMock.batchCommits).toHaveLength(1)

    // Even a snapshot that would normally look stale again (same id) is
    // suppressed by the session set within the same mount.
    const echoedStaleAgain = makeTask({
      id: 'task-stale-monthly',
      frequency: 'חודשי',
      status: 'בעבודה',
      cycleKey: '2026-08',
    })
    rerender({ tasks: [echoedStaleAgain] })
    expect(firestoreMock.batchCommits).toHaveLength(1)
  })

  it('TEST-R02.mixed-fixture-only-stale-recurring-in-batch', () => {
    renderHook(() =>
      useRecurringTaskReset(
        [STALE_MONTHLY, FRESH_MONTHLY, ALREADY_NOT_DONE, ONE_OFF],
        true
      )
    )
    expect(firestoreMock.batchCommits).toHaveLength(1)
    const ops = firestoreMock.batchCommits[0]
    expect(ops).toHaveLength(1)
    expect(ops[0].path).toBe('tasks/task-stale-monthly')
  })
})
