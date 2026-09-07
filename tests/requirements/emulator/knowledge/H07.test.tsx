// @vitest-environment jsdom
import '../../support/knowledge-vite-env'
/**
 * TEST-PLAN.md coverage:
 * - "### H — real chat workflows and source fidelity" row H07
 * - "## 6.1 Concrete subcase registry — authoritative classification" row H07
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { signInWithCustomToken, signOut } from 'firebase/auth'
import { useChatHistory } from '../../../../src/hooks/useChatHistory'
import { auth } from '../../../../src/lib/firebase'
import { adminApp, adminDb, clearAuthUsers, clearFirestore } from '../../support/knowledge-admin'
import { connectClientEmulators } from '../../support/knowledge-client-emulator'
import { ensureAuthUser } from '../../support/knowledge-fixtures'

function chatMessage(content: string) {
  return [{ role: 'user' as const, content }]
}

async function signInClient(uid: string) {
  await signOut(auth)
  const customToken = await getAuth(adminApp()).createCustomToken(uid)
  await signInWithCustomToken(auth, customToken)
}

describe('TEST-H07 useChatHistory boundaries and characterization', () => {
  beforeAll(() => {
    connectClientEmulators()
  })

  beforeEach(async () => {
    await clearFirestore()
    await clearAuthUsers()
  })

  afterEach(async () => {
    cleanup()
    await signOut(auth)
    await clearFirestore()
    await clearAuthUsers()
  })

  afterAll(async () => {
    await signOut(auth)
  })

  it('TEST-H07.scope-session-isolation (G)', async () => {
    await ensureAuthUser('coord-a-test')
    await ensureAuthUser('coord-b-test')

    await signInClient('coord-a-test')
    const hookA = renderHook(({ uid, type }: { uid: string; type: 'hq' | 'portal' }) => useChatHistory(uid, type), {
      initialProps: { uid: 'coord-a-test', type: 'hq' },
    })
    await waitFor(() => expect(hookA.result.current.loading).toBe(false), { timeout: 10_000 })
    await act(async () => { await hookA.result.current.saveSession(chatMessage('USER_A_SESSION_SENTINEL')) })
    await waitFor(() => {
      expect(hookA.result.current.sessions.some((session) =>
        session.messages.some((entry) => entry.content === 'USER_A_SESSION_SENTINEL'))).toBe(true)
    }, { timeout: 10_000 })
    await signInClient('coord-b-test')
    hookA.rerender({ uid: 'coord-b-test', type: 'portal' })
    await waitFor(() => expect(hookA.result.current.sessions).toEqual([]), { timeout: 10_000 })
    // Same mounted hook, settled initial save, then an identity/scope transition.
    // A new scope must not reuse A's document id to update a nonexistent B doc.
    await act(async () => { await hookA.result.current.saveSession(chatMessage('USER_B_SESSION_SENTINEL')) })
    const a = await adminDb().collection('users/coord-a-test/chatSessions').get()
    const b = await adminDb().collection('users/coord-b-test/chatSessions').get()
    expect(a.docs.map((doc) => doc.data().messages)).toEqual([chatMessage('USER_A_SESSION_SENTINEL')])
    expect(b.docs.map((doc) => doc.data().messages)).toEqual([chatMessage('USER_B_SESSION_SENTINEL')])
  })

  it('TEST-H07.current-limit-before-filter (C)', async () => {
    const uid = 'limit-before-filter-user'
    await ensureAuthUser(uid)
    const coll = adminDb().collection(`users/${uid}/chatSessions`)

    await coll.doc('hq-oldest').set({
      title: 'hq-oldest',
      type: 'hq',
      branchId: null,
      messages: chatMessage('OLDER_HQ_SENTINEL'),
      createdAt: Timestamp.fromMillis(1),
      updatedAt: Timestamp.fromMillis(1),
    })

    for (let index = 0; index < 15; index += 1) {
      const millis = 100 + index
      await coll.doc(`portal-newer-${index}`).set({
        title: `portal-${index}`,
        type: 'portal',
        branchId: 'branch-a',
        messages: chatMessage(`PORTAL_${index}`),
        createdAt: Timestamp.fromMillis(millis),
        updatedAt: Timestamp.fromMillis(millis),
      })
    }

    await signInClient(uid)
    const hook = renderHook(() => useChatHistory(uid, 'hq'))

    await waitFor(() => expect(hook.result.current.loading).toBe(false), { timeout: 10_000 })

    expect(hook.result.current.sessions).toEqual([])
  })
})
