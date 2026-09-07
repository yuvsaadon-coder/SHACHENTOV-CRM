// TEST-L03 real-emulator confirmation variant (+R lane).
//
// Mounts the REAL production `usePersonalTasks` hook via renderHook,
// connected to a real Firestore Emulator client SDK through
// tests/requirements/support/emulator-firebase-alias.ts. Confirms on real
// Firestore that after a real account switch (sign out A, sign in B), the
// hook's view settles to the new identity's own scope: a write on the old
// identity's path never leaks into the hook's now-B-scoped state — real
// SDK subscription/rules semantics the V-layer mock cannot by itself
// prove.
//
// Scope note: this asserts settled identity isolation as observed by the
// hook, not exclusively "React effect cleanup ran" in isolation from
// rules — after the real auth switch, firestore.rules also denies A's
// path to the now-B-authenticated client, so both mechanisms cooperate to
// produce the same real, correct end state a genuine user gets. To make
// sure this isn't a vacuous pass (e.g. from a late write nobody could
// ever have seen), the late write includes a real `createdAt` — the same
// field usePersonalTasks orders by — and its arrival in Firestore is
// independently confirmed by a SECOND real client, signed in as the
// SAME real uid A via a genuine Admin-issued custom token (not a cloned
// identity), proving the data is real and query-eligible before checking
// that the (now B-scoped) hook under test never receives it.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore'
import { signInAnonymously, signInWithCustomToken, signOut } from 'firebase/auth'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from '../../support/emulator-env'
import { createEmulatorFirebaseAlias } from '../../support/emulator-firebase-alias'
import { createEmulatorAdmin } from '../../support/emulator-admin'

const RUN_ID = `l03-${Date.now()}-${Math.random().toString(36).slice(2)}`
const id = (name: string) => `${RUN_ID}-${name}`

let env: RulesTestEnvironment
const alias = createEmulatorFirebaseAlias(`l03-alias-${RUN_ID}`)
const admin = createEmulatorAdmin(`l03-admin-${RUN_ID}`)
// Independent second real client — used ONLY as the control listener
// authorized as uid A (via a genuine custom token for that exact uid),
// never as the hook-under-test's own connection.
const controlA = createEmulatorFirebaseAlias(`l03-controlA-${RUN_ID}`)

vi.mock('../../../../src/lib/firebase', () => ({
  auth: alias.auth,
  db: alias.db,
  storage: alias.storage,
}))

// Real production hook is imported dynamically inside the test (not as a
// static top-level import): ES `import` declarations are hoisted and
// evaluate before any top-level `const`, so a static import here would
// resolve the mocked `src/lib/firebase` before `alias` is initialized
// (`ReferenceError: Cannot access 'alias' before initialization`).

beforeAll(async () => {
  assertEmulatorEnvironment()
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATORS.firestore.host,
      port: EMULATORS.firestore.port,
      rules: readFileSync(join('tests', 'requirements', '.cache', 'firestore.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await env?.cleanup()
  await alias.dispose()
  await controlA.dispose()
  await admin.dispose()
})

beforeEach(async () => {
  await env.clearFirestore()
})

describe('TEST-L03 (+R) emulator confirmation', () => {
  it('TEST-L03.emulator.personalTasks.old-scope-not-visible-after-identity-switch', async () => {
    // Real firestore.rules requires request.auth.uid == uid for
    // personalTasks reads, so a genuine scope change here means the
    // signed-in identity actually switches accounts (sign out A, sign in
    // B) — the same real scenario the requirement targets, using the
    // real Auth Emulator rather than an unauthenticated/mismatched uid.
    const credA = await signInAnonymously(alias.auth)
    const uidA = credA.user.uid
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${uidA}/personalTasks/${id('t1')}`), { title: 'A-1', done: false, createdAt: serverTimestamp() })
    })

    const { usePersonalTasks } = await import('../../../../src/hooks/usePersonalTasks')
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | undefined }) => usePersonalTasks(uid),
      { initialProps: { uid: uidA } },
    )
    await waitFor(() => expect(result.current.personalTasks.map((t) => t.id)).toContain(id('t1')))

    // Real account switch: sign out A, sign in as a fresh real identity B.
    await signOut(alias.auth)
    const credB = await signInAnonymously(alias.auth)
    const uidB = credB.user.uid
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${uidB}/personalTasks/${id('t2')}`), { title: 'B-1', done: false, createdAt: serverTimestamp() })
    })

    rerender({ uid: uidB })
    await waitFor(() => expect(result.current.personalTasks.map((t) => t.id)).toContain(id('t2')))
    // Requirement: A's task must no longer be presented under B.
    expect(result.current.personalTasks.map((t) => t.id)).not.toContain(id('t1'))

    // A late write on the OLD (A) path after the scope change, WITH a
    // real `createdAt` (the same field the hook's own query orders by) so
    // it is genuinely query-eligible, not silently dropped by orderBy
    // independent of any rules/subscription behavior.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${uidA}/personalTasks/${id('t1-late')}`), { title: 'late A', done: false, createdAt: serverTimestamp() })
    })

    // Independent control listener: sign in a SECOND, separate real
    // client as the EXACT SAME real uid A (via a genuine Admin-issued
    // custom token — not a fabricated identity) to positively confirm the
    // late write actually landed and is visible to a reader still
    // legitimately authorized for A — proving this isn't a vacuous check
    // against data nobody could ever see.
    const customTokenA = await admin.createCustomToken(uidA)
    await signInWithCustomToken(controlA.auth, customTokenA)
    const controlSnap = await waitFor(async () => {
      const snap = await getDocs(collection(controlA.db, `users/${uidA}/personalTasks`))
      const ids = snap.docs.map((d) => d.id)
      if (!ids.includes(id('t1-late'))) throw new Error('control listener has not observed the late A write yet')
      return snap
    })
    expect(controlSnap.docs.map((d) => d.id)).toContain(id('t1-late'))

    // Requirement: the hook under test — now signed in and scoped as B —
    // never reflects A's late write. Settled identity isolation: the
    // late write is real and independently observed by an A-authorized
    // reader (above), yet absent from this B-scoped view.
    await new Promise((r) => setTimeout(r, 300))
    expect(result.current.personalTasks.map((t) => t.id)).not.toContain(id('t1-late'))
  })
})
