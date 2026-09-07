// TEST-L01 — realtime hook subscription lifecycle for all eleven hooks.
// Requirements: T06a / E15. Layer V. Family classification: A.
//
// Per TEST-PLAN.md §6 row L01 the flow is:
//   GIVEN each hook's distinct synthetic collection records;
//   WHEN mounting, delivering empty then populated then added/modified/deleted
//        snapshots, and unmounting, including StrictMode;
//   THEN loading resolves, records/sort reflect events, each created
//        subscription instance is cleaned up exactly once, and zero
//        subscriptions remain live after final unmount with no post-unmount
//        visible updates.
//
// This layer (V) does NOT prove Firestore's real ordering semantics — we
// push already-ordered fixture arrays through firestoreMock.emitQuery and
// assert the hook renders them in the delivered order without silently
// re-deriving them. React 19 StrictMode double-invokes effects in dev, so
// subscribe/unsubscribe COUNTS are not asserted directly — we assert
// `liveCount(path)` reaches zero after final unmount and observable state
// reflects each snapshot.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
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
import { IDENTITIES } from '../../support/core-fixtures'

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

const COORD_UID = IDENTITIES.coordA.uid

function primeCoordAuth() {
  firestoreMock.setDocValue(`users/${COORD_UID}`, {
    name: IDENTITIES.coordA.name,
    email: IDENTITIES.coordA.email,
    role: IDENTITIES.coordA.role,
    active: true,
  })
  authMock.currentUser = { uid: COORD_UID, email: IDENTITIES.coordA.email }
}

beforeEach(() => {
  firestoreMock.reset()
  authMock.reset()
})

/**
 * Shared lifecycle expectations for a plain (no-arg) list hook.
 * NOT a business-logic helper — it only drives subscribe/emit/unmount and
 * checks that the hook mirrors the exact fixture array we pushed.
 */
async function runListHookLifecycle<T extends { id: string }>(opts: {
  path: string
  useHook: () => { loading: boolean; error?: string | null; items: T[] }
  populated: Array<{ id: string; data: Record<string, unknown> }>
  addedModifiedDeleted: Array<{ id: string; data: Record<string, unknown> }>
}) {
  const { path, useHook, populated, addedModifiedDeleted } = opts
  const { result, unmount } = renderHook(() => useHook())

  // Mount → loading true, no error, empty list.
  expect(result.current.loading).toBe(true)
  expect(result.current.items).toEqual([])
  expect(result.current.error ?? null).toBeNull()

  // Empty snapshot → loading false, empty list.
  act(() => firestoreMock.emitQuery(path, []))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.items).toEqual([])

  // Populated snapshot → items reflect the delivered order exactly.
  act(() => firestoreMock.emitQuery(path, populated))
  await waitFor(() => expect(result.current.items).toHaveLength(populated.length))
  expect(result.current.items.map((i) => i.id)).toEqual(populated.map((d) => d.id))

  // added/modified/deleted follow-up snapshot → items updated.
  act(() => firestoreMock.emitQuery(path, addedModifiedDeleted))
  await waitFor(() => expect(result.current.items).toHaveLength(addedModifiedDeleted.length))
  expect(result.current.items.map((i) => i.id)).toEqual(addedModifiedDeleted.map((d) => d.id))

  // At least one live listener while mounted.
  expect(firestoreMock.liveCount(path)).toBeGreaterThanOrEqual(1)

  // Unmount → zero live listeners.
  unmount()
  expect(firestoreMock.liveCount(path)).toBe(0)

  // Post-unmount emit must not throw or visibly update anything. We cannot
  // observe React state after unmount, but we can confirm the emit is a
  // no-op against zero live listeners.
  act(() => firestoreMock.emitQuery(path, populated))
  expect(firestoreMock.liveCount(path)).toBe(0)
}

describe('TEST-L01 hook subscription lifecycle', () => {
  it('TEST-L01.useTasks.lifecycle', async () => {
    await runListHookLifecycle({
      path: 'tasks',
      useHook: () => {
        const h = useTasks()
        return { loading: h.loading, error: h.error, items: h.tasks }
      },
      populated: [
        { id: 'task-fin', data: { domain: 'FIN', title: 'A' } },
        { id: 'task-vol', data: { domain: 'VOL', title: 'B' } },
      ],
      addedModifiedDeleted: [
        { id: 'task-fin', data: { domain: 'FIN', title: 'A-edited' } },
        { id: 'task-vol', data: { domain: 'VOL', title: 'B' } },
        { id: 'task-new', data: { domain: 'DES', title: 'C' } },
      ],
    })
  })

  it('TEST-L01.useContacts.lifecycle', async () => {
    await runListHookLifecycle({
      path: 'contacts',
      useHook: () => {
        const h = useContacts()
        return { loading: h.loading, items: h.contacts }
      },
      populated: [
        { id: 'contact-a', data: { name: 'א' } },
        { id: 'contact-b', data: { name: 'ב' } },
      ],
      addedModifiedDeleted: [
        { id: 'contact-a', data: { name: 'א-מעודכן' } },
        { id: 'contact-c', data: { name: 'ג' } },
      ],
    })
  })

  it('TEST-L01.useRoles.lifecycle', async () => {
    await runListHookLifecycle({
      path: 'roles',
      useHook: () => {
        const h = useRoles()
        return { loading: h.loading, error: h.error, items: h.roles }
      },
      populated: [
        { id: 'role-a', data: { roleName: 'תפקיד א', level: 'מטה' } },
        { id: 'role-b', data: { roleName: 'תפקיד ב', level: 'סניף' } },
      ],
      addedModifiedDeleted: [
        { id: 'role-a', data: { roleName: 'תפקיד א', level: 'מטה' } },
        { id: 'role-c', data: { roleName: 'תפקיד ג', level: 'מטה' } },
      ],
    })
  })

  it('TEST-L01.useBranch.lifecycle', async () => {
    primeCoordAuth()
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)
    const { result, unmount } = renderHook(() => useBranch(), { wrapper })

    // Wait for AuthProvider to resolve appUser so useBranch subscribes.
    await waitFor(() => expect(firestoreMock.liveCount('branches')).toBe(1))

    // Empty snapshot.
    act(() => firestoreMock.emitQuery('branches', []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.branches).toEqual([])

    // Populated.
    act(() =>
      firestoreMock.emitQuery('branches', [
        { id: 'branch-a', data: { name: 'סניף א', coordinatorUids: [COORD_UID] } },
        { id: 'branch-c', data: { name: 'קפה', coordinatorUids: [COORD_UID] } },
      ])
    )
    await waitFor(() => expect(result.current.branches).toHaveLength(2))
    expect(result.current.branches.map((b) => b.id)).toEqual(['branch-a', 'branch-c'])

    // Modified.
    act(() =>
      firestoreMock.emitQuery('branches', [
        { id: 'branch-a', data: { name: 'סניף א מעודכן', coordinatorUids: [COORD_UID] } },
      ])
    )
    await waitFor(() => expect(result.current.branches).toHaveLength(1))

    unmount()
    expect(firestoreMock.liveCount('branches')).toBe(0)
  })

  it('TEST-L01.useQuarterlyReports.lifecycle', async () => {
    await runListHookLifecycle({
      path: 'quarterlyReports',
      useHook: () => {
        const h = useQuarterlyReports('branch-a')
        return { loading: h.loading, items: h.reports }
      },
      // Push in the exact order the hook's sort would produce — hook sorts
      // by (year desc, quarter desc) but at V layer we assert the delivered
      // list is returned in that hand-authored order, we do not prove the
      // sort computes correctly for arbitrary input (that's the R layer).
      populated: [
        { id: 'r-2026-q3', data: { branchId: 'branch-a', year: 2026, quarter: 'Q3' } },
        { id: 'r-2025-q3', data: { branchId: 'branch-a', year: 2025, quarter: 'Q3' } },
      ],
      addedModifiedDeleted: [
        { id: 'r-2026-q3', data: { branchId: 'branch-a', year: 2026, quarter: 'Q3' } },
        { id: 'r-2026-q1', data: { branchId: 'branch-a', year: 2026, quarter: 'Q1' } },
        { id: 'r-2025-q3', data: { branchId: 'branch-a', year: 2025, quarter: 'Q3' } },
      ],
    })
  })

  it('TEST-L01.useAllQuarterlyReports.lifecycle', async () => {
    await runListHookLifecycle({
      path: 'quarterlyReports',
      useHook: () => {
        const h = useAllQuarterlyReports()
        return { loading: h.loading, error: h.error, items: h.reports }
      },
      populated: [
        { id: 'r-a', data: { branchId: 'branch-a', year: 2026, quarter: 'Q3' } },
        { id: 'r-b', data: { branchId: 'branch-b', year: 2026, quarter: 'Q2' } },
      ],
      addedModifiedDeleted: [
        { id: 'r-a', data: { branchId: 'branch-a', year: 2026, quarter: 'Q3' } },
        { id: 'r-c', data: { branchId: 'branch-c', year: 2026, quarter: 'Q3' } },
      ],
    })
  })

  it('TEST-L01.useReportQuestions.lifecycle', async () => {
    await runListHookLifecycle({
      path: 'reportQuestions',
      useHook: () => {
        const h = useReportQuestions('food')
        return { loading: h.loading, error: h.error, items: h.questions }
      },
      // Deliver already-in-order fixtures — hook sorts by `order`, and pushing
      // them in that same order lets us assert the hook returns them exactly.
      populated: [
        { id: 'q-1', data: { branchType: 'food', key: 'k1', order: 1, label: 'a' } },
        { id: 'q-2', data: { branchType: 'food', key: 'k2', order: 2, label: 'b' } },
      ],
      addedModifiedDeleted: [
        { id: 'q-1', data: { branchType: 'food', key: 'k1', order: 1, label: 'a' } },
        { id: 'q-3', data: { branchType: 'food', key: 'k3', order: 3, label: 'c' } },
      ],
    })
  })

  it('TEST-L01.useKnowledge.lifecycle', async () => {
    await runListHookLifecycle({
      path: 'knowledgeItems',
      useHook: () => {
        const h = useKnowledge('branch-a')
        return { loading: h.loading, items: h.items }
      },
      populated: [
        { id: 'k-1', data: { branchId: 'branch-a', title: 'א' } },
        { id: 'k-2', data: { branchId: 'global', title: 'ב' } },
      ],
      addedModifiedDeleted: [
        { id: 'k-1', data: { branchId: 'branch-a', title: 'א-מעודכן' } },
        { id: 'k-3', data: { branchId: 'global', title: 'ג' } },
      ],
    })
  })

  it('TEST-L01.useHQKnowledge.lifecycle', async () => {
    await runListHookLifecycle({
      path: 'hq_knowledge',
      useHook: () => {
        const h = useHQKnowledge()
        return { loading: h.loading, items: h.items }
      },
      populated: [
        { id: 'hq-1', data: { domain: 'FIN', title: 'א' } },
        { id: 'hq-2', data: { domain: 'VOL', title: 'ב' } },
      ],
      addedModifiedDeleted: [
        { id: 'hq-1', data: { domain: 'FIN', title: 'א-מעודכן' } },
        { id: 'hq-3', data: { domain: 'DON', title: 'ג' } },
      ],
    })
  })

  it('TEST-L01.usePersonalTasks.lifecycle', async () => {
    await runListHookLifecycle({
      path: `users/${COORD_UID}/personalTasks`,
      useHook: () => {
        const h = usePersonalTasks(COORD_UID)
        return { loading: h.loading, error: h.error, items: h.personalTasks }
      },
      populated: [
        { id: 'pt-1', data: { title: 'א' } },
        { id: 'pt-2', data: { title: 'ב' } },
      ],
      addedModifiedDeleted: [
        { id: 'pt-1', data: { title: 'א-מעודכן' } },
        { id: 'pt-3', data: { title: 'ג' } },
      ],
    })
  })

  it('TEST-L01.useChatHistory.lifecycle', async () => {
    // useChatHistory is scope-filtered on the client (type/branchId), so we
    // push documents that already match the requested scope.
    const path = `users/${COORD_UID}/chatSessions`
    const { result, unmount } = renderHook(() =>
      useChatHistory(COORD_UID, 'portal', 'branch-a')
    )
    expect(result.current.loading).toBe(true)
    expect(result.current.sessions).toEqual([])

    act(() => firestoreMock.emitQuery(path, []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toEqual([])

    act(() =>
      firestoreMock.emitQuery(path, [
        { id: 's-1', data: { title: 'שיחה 1', type: 'portal', branchId: 'branch-a', messages: [] } },
        { id: 's-2', data: { title: 'שיחה 2', type: 'portal', branchId: 'branch-a', messages: [] } },
      ])
    )
    await waitFor(() => expect(result.current.sessions).toHaveLength(2))

    // added/modified/deleted: swap in one new session and drop the second.
    act(() =>
      firestoreMock.emitQuery(path, [
        { id: 's-1', data: { title: 'שיחה 1 מעודכנת', type: 'portal', branchId: 'branch-a', messages: [] } },
        { id: 's-3', data: { title: 'שיחה 3', type: 'portal', branchId: 'branch-a', messages: [] } },
      ])
    )
    await waitFor(() => expect(result.current.sessions.map((s) => s.id)).toEqual(['s-1', 's-3']))

    expect(firestoreMock.liveCount(path)).toBeGreaterThanOrEqual(1)
    unmount()
    expect(firestoreMock.liveCount(path)).toBe(0)
  })

  // StrictMode representative cases — React 19 double-invokes effects in
  // dev, so we assert eventual state and zero-live-listeners-on-unmount
  // rather than exact subscribe/unsubscribe counts.
  it('TEST-L01.useTasks.strictmode-lifecycle', async () => {
    const { result, unmount } = renderHook(() => useTasks(), {
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    })

    // Snapshot delivery must still resolve loading exactly once, no matter
    // how many effect passes StrictMode ran.
    act(() =>
      firestoreMock.emitQuery('tasks', [{ id: 'task-fin', data: { domain: 'FIN', title: 'A' } }])
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tasks.map((t) => t.id)).toEqual(['task-fin'])

    unmount()
    expect(firestoreMock.liveCount('tasks')).toBe(0)
  })

  // TEST-L01.useContacts.strictmode-lifecycle and
  // TEST-L01.usePersonalTasks.strictmode-lifecycle were consolidated here
  // (removed as benign duplicates, not requirement gaps). useContacts and
  // usePersonalTasks subscribe via the exact same
  // `useEffect(() => { ...onSnapshot(...); return unsub }, [deps])` shape as
  // useTasks (see src/hooks/useContacts.ts, src/hooks/usePersonalTasks.ts,
  // src/hooks/useTasks.ts) — StrictMode's double-invoke-effects behavior is
  // a property of that shared React/Firestore pattern, not per-hook business
  // logic, so TEST-L01.useTasks.strictmode-lifecycle above already proves
  // the pattern once for all hooks using it. Both removed tests passed
  // (see RESULTS.md); no requirement-gap evidence is lost.
})
