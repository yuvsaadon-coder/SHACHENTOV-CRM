// TEST-R04 — rejected batch commit + observability gap (V+R; C/G).
// Split per TEST-PLAN.md §6.1:
//   R04.current-rejected-batch (C) — precommit session suppression when
//     writeBatch().commit() rejects. Baseline: src/hooks/useRecurringTaskReset.ts
//     lines 62-72 add each task id to resetInSession *inside* the sync for
//     loop, BEFORE `void batch.commit()` is even called. If the commit later
//     rejects, the task is still marked reset in-session, so a rerender
//     with the same stale snapshot triggers NO retry.
//   R04.recovery-observability (G) — a failed reset must remain actionable:
//     a later render with the same stale task must retry. Baseline:
//     resetInSession marks the id before commit even settles, so retry
//     never happens within the same mount.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

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

const STALE = makeTask({
  id: 'task-stale-r04',
  frequency: 'חודשי',
  status: 'בעבודה',
  cycleKey: '2026-08',
})

describe('TEST-R04 rejected batch commit (C/G)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('TEST-R04.current-rejected-batch', async () => {
    // Queue rejection for the batch commit that the hook will fire.
    firestoreMock.queueWriteResult(
      'batch.commit',
      'reject',
      new Error('simulated firestore batch failure')
    )

    // Suppress the unhandled-rejection noise from `void batch.commit()`
    // (the hook fire-and-forgets the promise — that is the observability
    // gap R04.recovery-observability characterizes below).
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    let result: unknown
    try {
      const rendered = renderHook(
        ({ tasks }: { tasks: Task[] }) => useRecurringTaskReset(tasks, true),
        { initialProps: { tasks: [STALE] } }
      )
      result = rendered.result.current

      // First cycle: the batch was constructed and commit was attempted.
      expect(firestoreMock.batchCommits).toHaveLength(1)
      expect(firestoreMock.batchCommits[0][0].path).toBe('tasks/task-stale-r04')

      // Let the rejected promise settle so we can observe follow-up state.
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      // Rerender with the SAME stale snapshot — the task never actually
      // got written, but resetInSession already contains its id, so the
      // hook suppresses any retry. NO second commit attempt.
      rendered.rerender({ tasks: [STALE] })
      expect(firestoreMock.batchCommits).toHaveLength(1)

      // Even after another rerender the suppression persists.
      rendered.rerender({ tasks: [STALE] })
      expect(firestoreMock.batchCommits).toHaveLength(1)
    } finally {
      process.off('unhandledRejection', unhandled)
    }

    // TEST-R04.recovery-observability (G):
    // Nothing the hook returned changed after the failed commit, and no
    // error surfaced synchronously to renderHook. The hook returns void
    // (no error state exposed), and `void batch.commit()` deliberately
    // discards the rejection — the caller has no observable signal.
    expect(result).toBeUndefined()
  })

  it('TEST-R04.recovery-observability (G) — a failed reset must remain actionable: a later render with the same stale snapshot must retry, not be silently suppressed forever', async () => {
    firestoreMock.queueWriteResult(
      'batch.commit',
      'reject',
      new Error('simulated firestore batch failure'),
    )
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    try {
      const rendered = renderHook(
        ({ tasks }: { tasks: Task[] }) => useRecurringTaskReset(tasks, true),
        { initialProps: { tasks: [STALE] } },
      )
      expect(firestoreMock.batchCommits).toHaveLength(1)

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      // Requirement: since the first commit never actually succeeded, a
      // later render with the same stale task must retry the reset.
      rendered.rerender({ tasks: [STALE] })
      expect(firestoreMock.batchCommits).toHaveLength(2)
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})
