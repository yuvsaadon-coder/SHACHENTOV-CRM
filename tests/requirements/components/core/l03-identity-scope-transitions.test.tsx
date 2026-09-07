// TEST-L03 — identity/scope transitions on realtime hooks.
// Requirements: T06 / T11 / T15. Layer V. Family classification: G.
//
// GIVEN A branch/private/history data visible; WHEN UID/branch/type
// changes to B or undefined while a new snapshot is deferred; THEN no A
// data is presented as B, old subscription closes, and late A delivery
// cannot corrupt B.
//
// Each test asserts the REQUIRED behavior (no stale data leaks across a
// scope change) and reports the actual result — a red result is a real,
// non-inverted production gap.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

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
import { usePersonalTasks } from '../../../../src/hooks/usePersonalTasks'
import { useKnowledge } from '../../../../src/hooks/useKnowledge'
import { useChatHistory } from '../../../../src/hooks/useChatHistory'

beforeEach(() => {
  firestoreMock.reset()
  authMock.reset()
})

describe('TEST-L03 identity/scope transitions', () => {
  // Requirement: A's data must not be presented under B while B's own
  // snapshot is still pending.
  it('TEST-L03.usePersonalTasks.uid-change-no-stale-A-data', async () => {
    const pathA = 'users/coord-a/personalTasks'
    const pathB = 'users/coord-b/personalTasks'

    const { result, rerender } = renderHook(({ uid }) => usePersonalTasks(uid), {
      initialProps: { uid: 'coord-a' as string | undefined },
    })

    act(() => firestoreMock.emitQuery(pathA, [{ id: 'pt-A1', data: { title: 'A-1' } }]))
    await waitFor(() => expect(result.current.personalTasks.map((t) => t.id)).toEqual(['pt-A1']))

    rerender({ uid: 'coord-b' })
    await waitFor(() => expect(firestoreMock.liveCount(pathB)).toBe(1))

    // B's own snapshot is still pending: A's data must not be shown as B's.
    expect(result.current.personalTasks).toEqual([])

    // A late straggler on the old A path must not corrupt B either way.
    act(() => firestoreMock.emitQuery(pathA, [{ id: 'pt-A2-late', data: { title: 'late A' } }]))
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.personalTasks).toEqual([])

    act(() => firestoreMock.emitQuery(pathB, [{ id: 'pt-B1', data: { title: 'B-1' } }]))
    await waitFor(() => expect(result.current.personalTasks.map((t) => t.id)).toEqual(['pt-B1']))
  })

  it('TEST-L03.usePersonalTasks.uid-to-undefined-clears-immediately', async () => {
    const pathA = 'users/coord-a/personalTasks'
    const { result, rerender } = renderHook(({ uid }) => usePersonalTasks(uid), {
      initialProps: { uid: 'coord-a' as string | undefined },
    })
    act(() => firestoreMock.emitQuery(pathA, [{ id: 'pt-A1', data: { title: 'A-1' } }]))
    await waitFor(() => expect(result.current.personalTasks).toHaveLength(1))

    rerender({ uid: undefined })
    await waitFor(() => expect(result.current.personalTasks).toEqual([]))
    expect(firestoreMock.liveCount(pathA)).toBe(0)
    expect(result.current.loading).toBe(false)
  })

  // Requirement: a branch/scope change must not keep the old branch's
  // items visible while the new branch's snapshot is pending.
  it('TEST-L03.useKnowledge.branch-change-no-stale-A-data', async () => {
    const path = 'knowledgeItems'
    const { result, rerender } = renderHook(({ branchId }) => useKnowledge(branchId), {
      initialProps: { branchId: 'branch-a' as string | null },
    })

    act(() =>
      firestoreMock.emitQuery(path, [
        { id: 'k-A1', data: { branchId: 'branch-a', title: 'A-1', createdAt: null } },
      ])
    )
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['k-A1']))

    rerender({ branchId: 'branch-b' })
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.items).toEqual([])

    rerender({ branchId: null })
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.items).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  // Requirement: a scope change (uid/type/branchId) must not leave a
  // previous scope's selected session id in effect for the new scope.
  it('TEST-L03.useChatHistory.scope-change-clears-session-id', async () => {
    const pathA = 'users/coord-a/chatSessions'
    const pathB = 'users/coord-b/chatSessions'

    const { result, rerender } = renderHook(
      ({ uid, type, branchId }: { uid: string; type: 'portal' | 'hq'; branchId?: string }) =>
        useChatHistory(uid, type, branchId),
      { initialProps: { uid: 'coord-a', type: 'portal' as 'portal' | 'hq', branchId: 'branch-a' as string | undefined } }
    )

    act(() =>
      firestoreMock.emitQuery(pathA, [
        { id: 's-A1', data: { title: 'A', type: 'portal', branchId: 'branch-a', messages: [] } },
      ])
    )
    await waitFor(() => expect(result.current.sessions.map((s) => s.id)).toEqual(['s-A1']))

    act(() => result.current.loadSession(result.current.sessions[0]))
    expect(result.current.currentSessionId).toBe('s-A1')

    rerender({ uid: 'coord-b', type: 'hq' as 'portal' | 'hq', branchId: undefined as string | undefined })
    await waitFor(() => expect(firestoreMock.liveCount(pathB)).toBe(1))
    expect(firestoreMock.liveCount(pathA)).toBe(0)

    // The new scope must not carry over A's selected session id.
    expect(result.current.currentSessionId).toBeNull()

    // Late A straggler must not corrupt the new scope either way.
    act(() =>
      firestoreMock.emitQuery(pathA, [
        { id: 's-A-late', data: { title: 'late', type: 'portal', branchId: 'branch-a', messages: [] } },
      ])
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.currentSessionId).toBeNull()
  })

  it('TEST-L03.useChatHistory.startNewSession-clears-id', async () => {
    const pathA = 'users/coord-a/chatSessions'
    const { result } = renderHook(() => useChatHistory('coord-a', 'portal', 'branch-a'))
    act(() =>
      firestoreMock.emitQuery(pathA, [
        { id: 's-A1', data: { title: 'A', type: 'portal', branchId: 'branch-a', messages: [] } },
      ])
    )
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))
    act(() => result.current.loadSession(result.current.sessions[0]))
    expect(result.current.currentSessionId).toBe('s-A1')
    act(() => result.current.startNewSession())
    expect(result.current.currentSessionId).toBeNull()
  })
})
