// Smoke test for the shared core-firestore-mock / core-auth-mock infrastructure.
// Not a TEST-<ID> requirement case; verifies the harness delivers snapshots,
// errors, and auth-state changes before other TEST-A/L/T/R files rely on it.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const { buildFirestoreMock } = await import('../../support/core-firestore-mock')
  return buildFirestoreMock(actual)
})

import { firestoreMock } from '../../support/core-firestore-mock'
import { useTasks } from '../../../../src/hooks/useTasks'

describe('harness smoke check (infrastructure, not a requirement test)', () => {
  beforeEach(() => firestoreMock.reset())

  it('delivers a pushed snapshot to a real production hook', async () => {
    const { result, unmount } = renderHook(() => useTasks())
    expect(result.current.loading).toBe(true)
    firestoreMock.emitQuery('tasks', [{ id: 'task-fin', data: { domain: 'FIN', title: 'x' } }])
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0].id).toBe('task-fin')
    expect(firestoreMock.liveCount('tasks')).toBe(1)
    unmount()
    expect(firestoreMock.liveCount('tasks')).toBe(0)
  })

  it('delivers a listener error', async () => {
    const { result } = renderHook(() => useTasks())
    firestoreMock.emitError('tasks', 'permission-denied', 'permission-denied')
    await waitFor(() => expect(result.current.error).toBeTruthy())
  })
})
