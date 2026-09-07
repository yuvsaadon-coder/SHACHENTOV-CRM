// TEST-L02 — hook error handling & remount recovery.
// Requirements: T06a / T06b. Layer V. Family classification: G.
//
// GIVEN pending subscription; WHEN permission-denied/network listener error
// occurs and a fresh remount succeeds; THEN observable error replaces
// indefinite spinner, stale success is not presented as fresh data, and
// retry/remount recovers.
//
// Each test asserts the REQUIRED behavior directly (error must surface;
// remount recovers) and reports the actual result. A red result below is a
// genuine, non-inverted production gap, not an assertion that the gap is
// the requirement.
//
// Retraction (post-review correction): two earlier cases
// (`useRoles.error-clears-on-subsequent-success`,
// `useTasks.error-clears-on-subsequent-success`) asserted that a SUCCESS
// snapshot could arrive on the SAME subscription after that subscription's
// error callback had already fired. Real Firestore `onSnapshot` error
// callbacks are terminal — the SDK never delivers another snapshot or
// error to a listener once it has errored; a caller must create a new
// subscription. Those two cases were asserting impossible-in-practice SDK
// behavior, not a reachable production defect, and are retracted as
// production-defect claims. `core-firestore-mock.ts`'s `emitError` now
// marks the listener inactive after firing (matching real semantics), and
// the useRoles case is replaced with a fresh-remount-recovery test
// mirroring the existing (and still valid) useTasks one; the useTasks
// duplicate case is removed rather than replaced, since remount recovery
// for useTasks is already covered by `error-then-remount-recovers` above.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const { buildFirestoreMock } = await import('../../support/core-firestore-mock')
  return buildFirestoreMock(actual)
})

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>()
  const { buildAuthMock } = await import('../../support/core-auth-mock')
  return buildAuthMock(actual)
})

import { firestoreMock } from '../../support/core-firestore-mock'
import { authMock } from '../../support/core-auth-mock'

import { useTasks } from '../../../../src/hooks/useTasks'
import { useContacts } from '../../../../src/hooks/useContacts'
import { useRoles } from '../../../../src/hooks/useRoles'
import { useBranch } from '../../../../src/hooks/useBranch'
import { useQuarterlyReports } from '../../../../src/hooks/useQuarterlyReports'
import { useAllQuarterlyReports } from '../../../../src/hooks/useAllQuarterlyReports'
import { useReportQuestions } from '../../../../src/hooks/useReportQuestions'
import { useKnowledge } from '../../../../src/hooks/useKnowledge'
import { useHQKnowledge } from '../../../../src/hooks/useHQKnowledge'
import { usePersonalTasks } from '../../../../src/hooks/usePersonalTasks'
import { useChatHistory } from '../../../../src/hooks/useChatHistory'
import { AuthProvider } from '../../../../src/context/AuthContext'

beforeEach(() => {
  firestoreMock.reset()
  authMock.reset()
})

function primeSignedIn(uid: string, role = 'coordinator') {
  firestoreMock.setDocValue(`users/${uid}`, {
    name: 'משתמש בדיקה', email: `${uid}@requirements.invalid`, role, active: true,
  })
  authMock.currentUser = { uid }
}

function withAuth({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('TEST-L02 hook error handling', () => {
  it('TEST-L02.useTasks.error-then-remount-recovers', async () => {
    const first = renderHook(() => useTasks())
    expect(first.result.current.loading).toBe(true)

    act(() => firestoreMock.emitError('tasks', 'Missing or insufficient permissions.', 'permission-denied'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.error).toBe('Missing or insufficient permissions.')
    expect(first.result.current.tasks).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('tasks')).toBe(0)

    const second = renderHook(() => useTasks())
    expect(second.result.current.error).toBeNull()
    expect(second.result.current.loading).toBe(true)

    act(() =>
      firestoreMock.emitQuery('tasks', [{ id: 'task-fin', data: { domain: 'FIN', title: 'x' } }])
    )
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.error).toBeNull()
    expect(second.result.current.tasks.map((t) => t.id)).toEqual(['task-fin'])
    second.unmount()
  })

  // Requirement: an emitted listener error must be observable (not an
  // indefinite spinner + silently stale/empty data).
  it('TEST-L02.useContacts.error-surfaces', async () => {
    const { result } = renderHook(() => useContacts())
    expect(result.current.loading).toBe(true)

    act(() => firestoreMock.emitError('contacts', 'Missing or insufficient permissions.', 'permission-denied'))
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect((result.current as unknown as { error?: string }).error).toBe('Missing or insufficient permissions.')
    })
  })

  // Requirement: stale success must not be presented as fresh once a
  // later error is emitted on the same subscription. Uses a permanent
  // permission-denied fixture (revoked access), not a transient
  // 'unavailable' — real Firestore internally retries transient
  // network errors and doesn't necessarily surface them to the listener's
  // error callback at all, so a transient code isn't a reliable fixture
  // for "does this terminal error callback path work".
  it('TEST-L02.useContacts.stale-success-not-presented-as-fresh-after-error', async () => {
    const { result } = renderHook(() => useContacts())
    act(() => firestoreMock.emitQuery('contacts', [{ id: 'c-1', data: { name: 'א' } }]))
    await waitFor(() => expect(result.current.contacts).toHaveLength(1))

    act(() => firestoreMock.emitError('contacts', 'permission denied', 'permission-denied'))
    await waitFor(() => {
      expect((result.current as unknown as { error?: string }).error).toBe('permission denied')
    })
  })

  // Requirement: after a listener error terminates the subscription (real
  // Firestore onSnapshot error callbacks are terminal — no further
  // snapshots/errors are ever delivered to that listener), a fresh remount
  // recovers with a clean state. Note: emitting a success snapshot on the
  // SAME subscription after emitError is not real SDK behavior and is not
  // asserted here — see core-firestore-mock.ts's emitError semantics.
  it('TEST-L02.useRoles.error-then-remount-recovers', async () => {
    const first = renderHook(() => useRoles())
    act(() => firestoreMock.emitError('roles', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.error).toBe('permission denied'))
    expect(first.result.current.roles).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('roles')).toBe(0)

    const second = renderHook(() => useRoles())
    expect(second.result.current.error).toBeNull()

    act(() => firestoreMock.emitQuery('roles', [{ id: 'role-a', data: { roleName: 'r' } }]))
    await waitFor(() => expect(second.result.current.roles).toHaveLength(1))
    expect(second.result.current.error).toBeNull()
    second.unmount()
  })

  // Remaining named hooks (TEST-PLAN.md T06a's 11-hook inventory): each
  // case below drives the REAL hook (never a cloned/hand-authored proxy)
  // through an error on a first subscription, then a fresh remount to
  // confirm clean recovery — the same terminal-listener-safe pattern as
  // useTasks/useRoles above (never asserting success after error on the
  // SAME subscription). Several of these hooks have NO `error` state at
  // all in production; those cases assert the REQUIRED behavior (error
  // must be observable) via a type-erased read of `.error` and correctly
  // fail red — a genuine gap, not a test defect.

  it('TEST-L02.useBranch.error-then-remount-recovers', async () => {
    primeSignedIn('coord-branch-1')
    const first = renderHook(() => useBranch(), { wrapper: withAuth })
    await waitFor(() => expect(firestoreMock.liveCount('branches')).toBe(1))

    act(() => firestoreMock.emitError('branches', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    // Requirement: the error must be observable. Real gap expected:
    // useBranch has no `error` state at all (src/hooks/useBranch.ts).
    expect((first.result.current as unknown as { error?: string }).error).toBe('permission denied')
    expect(first.result.current.branches).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('branches')).toBe(0)

    const second = renderHook(() => useBranch(), { wrapper: withAuth })
    await waitFor(() => expect(firestoreMock.liveCount('branches')).toBe(1))
    expect((second.result.current as unknown as { error?: string | null }).error ?? null).toBeNull()

    act(() => firestoreMock.emitQuery('branches', [{ id: 'b-1', data: { name: 'סניף', type: 'food', city: 'עיר', coordinatorUids: ['coord-branch-1'] } }]))
    await waitFor(() => expect(second.result.current.branches).toHaveLength(1))
    second.unmount()
  })

  it('TEST-L02.useQuarterlyReports.error-then-remount-recovers', async () => {
    const first = renderHook(() => useQuarterlyReports('branch-1'))
    await waitFor(() => expect(firestoreMock.liveCount('quarterlyReports')).toBe(1))

    act(() => firestoreMock.emitError('quarterlyReports', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    // Requirement: the error must be observable. Real gap expected:
    // useQuarterlyReports has no `error` state at all.
    expect((first.result.current as unknown as { error?: string }).error).toBe('permission denied')
    expect(first.result.current.reports).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('quarterlyReports')).toBe(0)

    const second = renderHook(() => useQuarterlyReports('branch-1'))
    await waitFor(() => expect(firestoreMock.liveCount('quarterlyReports')).toBe(1))
    expect((second.result.current as unknown as { error?: string | null }).error ?? null).toBeNull()

    act(() => firestoreMock.emitQuery('quarterlyReports', [{ id: 'r-1', data: { branchId: 'branch-1', branchType: 'food', quarter: 'Q1', year: 2026 } }]))
    await waitFor(() => expect(second.result.current.reports).toHaveLength(1))
    second.unmount()
  })

  it('TEST-L02.useAllQuarterlyReports.error-then-remount-recovers', async () => {
    const first = renderHook(() => useAllQuarterlyReports())
    await waitFor(() => expect(firestoreMock.liveCount('quarterlyReports')).toBe(1))

    act(() => firestoreMock.emitError('quarterlyReports', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.error).toBe('permission denied'))
    expect(first.result.current.reports).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('quarterlyReports')).toBe(0)

    const second = renderHook(() => useAllQuarterlyReports())
    await waitFor(() => expect(firestoreMock.liveCount('quarterlyReports')).toBe(1))
    expect(second.result.current.error).toBeNull()

    act(() => firestoreMock.emitQuery('quarterlyReports', [{ id: 'r-1', data: { branchId: 'branch-1', branchType: 'food', quarter: 'Q1', year: 2026 } }]))
    await waitFor(() => expect(second.result.current.reports).toHaveLength(1))
    expect(second.result.current.error).toBeNull()
    second.unmount()
  })

  it('TEST-L02.useReportQuestions.error-then-remount-recovers', async () => {
    const first = renderHook(() => useReportQuestions('food'))
    await waitFor(() => expect(firestoreMock.liveCount('reportQuestions')).toBe(1))

    act(() => firestoreMock.emitError('reportQuestions', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.error).toBe('permission denied'))
    expect(first.result.current.questions).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('reportQuestions')).toBe(0)

    const second = renderHook(() => useReportQuestions('food'))
    await waitFor(() => expect(firestoreMock.liveCount('reportQuestions')).toBe(1))
    expect(second.result.current.error).toBeNull()

    act(() => firestoreMock.emitQuery('reportQuestions', [{ id: 'q-1', data: { branchType: 'food', order: 1, key: 'k', label: 'ל', type: 'text' } }]))
    await waitFor(() => expect(second.result.current.questions).toHaveLength(1))
    expect(second.result.current.error).toBeNull()
    second.unmount()
  })

  it('TEST-L02.useKnowledge.error-then-remount-recovers', async () => {
    const first = renderHook(() => useKnowledge('branch-1'))
    await waitFor(() => expect(firestoreMock.liveCount('knowledgeItems')).toBe(1))

    act(() => firestoreMock.emitError('knowledgeItems', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    // Requirement: the error must be observable. Real gap expected:
    // useKnowledge has no `error` state at all.
    expect((first.result.current as unknown as { error?: string }).error).toBe('permission denied')
    expect(first.result.current.items).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('knowledgeItems')).toBe(0)

    const second = renderHook(() => useKnowledge('branch-1'))
    await waitFor(() => expect(firestoreMock.liveCount('knowledgeItems')).toBe(1))
    expect((second.result.current as unknown as { error?: string | null }).error ?? null).toBeNull()

    act(() => firestoreMock.emitQuery('knowledgeItems', [{ id: 'k-1', data: { branchId: 'branch-1', type: 'text', title: 'כ', content: 'ת', tags: [] } }]))
    await waitFor(() => expect(second.result.current.items).toHaveLength(1))
    second.unmount()
  })

  it('TEST-L02.useHQKnowledge.error-then-remount-recovers', async () => {
    const first = renderHook(() => useHQKnowledge('all'))
    await waitFor(() => expect(firestoreMock.liveCount('hq_knowledge')).toBe(1))

    act(() => firestoreMock.emitError('hq_knowledge', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    // Requirement: the error must be observable. Real gap expected:
    // useHQKnowledge has no `error` state at all.
    expect((first.result.current as unknown as { error?: string }).error).toBe('permission denied')
    expect(first.result.current.items).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('hq_knowledge')).toBe(0)

    const second = renderHook(() => useHQKnowledge('all'))
    await waitFor(() => expect(firestoreMock.liveCount('hq_knowledge')).toBe(1))
    expect((second.result.current as unknown as { error?: string | null }).error ?? null).toBeNull()

    act(() => firestoreMock.emitQuery('hq_knowledge', [{ id: 'h-1', data: { domain: 'FIN', category: 'other', title: 'כ', content: 'ת', tags: [] } }]))
    await waitFor(() => expect(second.result.current.items).toHaveLength(1))
    second.unmount()
  })

  it('TEST-L02.usePersonalTasks.error-then-remount-recovers', async () => {
    const first = renderHook(() => usePersonalTasks('uid-1'))
    await waitFor(() => expect(firestoreMock.liveCount('users/uid-1/personalTasks')).toBe(1))

    act(() => firestoreMock.emitError('users/uid-1/personalTasks', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.error).toBe('permission denied'))
    expect(first.result.current.personalTasks).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('users/uid-1/personalTasks')).toBe(0)

    const second = renderHook(() => usePersonalTasks('uid-1'))
    await waitFor(() => expect(firestoreMock.liveCount('users/uid-1/personalTasks')).toBe(1))
    expect(second.result.current.error).toBeNull()

    act(() => firestoreMock.emitQuery('users/uid-1/personalTasks', [{ id: 'p-1', data: { title: 'מ', done: false } }]))
    await waitFor(() => expect(second.result.current.personalTasks).toHaveLength(1))
    expect(second.result.current.error).toBeNull()
    second.unmount()
  })

  it('TEST-L02.useChatHistory.error-then-remount-recovers', async () => {
    const first = renderHook(() => useChatHistory('uid-1', 'hq'))
    await waitFor(() => expect(firestoreMock.liveCount('users/uid-1/chatSessions')).toBe(1))

    act(() => firestoreMock.emitError('users/uid-1/chatSessions', 'permission denied', 'permission-denied'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    // Requirement: the error must be observable. Real gap expected:
    // useChatHistory has no `error` state at all.
    expect((first.result.current as unknown as { error?: string }).error).toBe('permission denied')
    expect(first.result.current.sessions).toEqual([])

    first.unmount()
    expect(firestoreMock.liveCount('users/uid-1/chatSessions')).toBe(0)

    const second = renderHook(() => useChatHistory('uid-1', 'hq'))
    await waitFor(() => expect(firestoreMock.liveCount('users/uid-1/chatSessions')).toBe(1))
    expect((second.result.current as unknown as { error?: string | null }).error ?? null).toBeNull()

    act(() => firestoreMock.emitQuery('users/uid-1/chatSessions', [{ id: 's-1', data: { type: 'hq', title: 'ש', messages: [] } }]))
    await waitFor(() => expect(second.result.current.sessions).toHaveLength(1))
    second.unmount()
  })
})
