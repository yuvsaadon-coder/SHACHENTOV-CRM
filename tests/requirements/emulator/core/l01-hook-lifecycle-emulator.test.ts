// TEST-L01 real-emulator confirmation variant (+R lane).
//
// Mounts the REAL production hooks (useTasks, useBranch,
// useQuarterlyReports) via renderHook, connected to a real Firestore
// Emulator client SDK through
// tests/requirements/support/emulator-firebase-alias.ts (substitutes
// only this test's own resolution of `src/lib/firebase`; no production
// file edited). Confirms real query/ordering semantics the V-layer mock
// cannot reproduce — e.g. real Firestore drops documents missing an
// orderBy field, and array-contains/where filters are honored server-side.
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
import { doc, setDoc } from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from '../../support/emulator-env'
import { createEmulatorFirebaseAlias } from '../../support/emulator-firebase-alias'

const RUN_ID = `l01-${Date.now()}-${Math.random().toString(36).slice(2)}`
const id = (name: string) => `${RUN_ID}-${name}`

let env: RulesTestEnvironment
const alias = createEmulatorFirebaseAlias(`l01-alias-${RUN_ID}`)

vi.mock('../../../../src/lib/firebase', () => ({
  auth: alias.auth,
  db: alias.db,
  storage: alias.storage,
}))

// Real production hooks are imported dynamically inside each test (not as
// static top-level imports): ES `import` declarations are hoisted and
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
})

beforeEach(async () => {
  await env.clearFirestore()
})

async function signInAs(role: string) {
  const cred = await signInAnonymously(alias.auth)
  const uid = cred.user.uid
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), {
      name: 'משתמש בדיקה', email: `${uid}@requirements.invalid`, role, active: true,
    })
  })
  return uid
}

async function getReactAuthProvider() {
  const { AuthProvider } = await import('../../../../src/context/AuthContext')
  const React = await import('react')
  return { AuthProvider, React }
}

describe('TEST-L01 (+R) emulator confirmation', () => {
  it('TEST-L01.emulator.useTasks.orderBy-drops-missing-field', async () => {
    await signInAs('admin')
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore()
      await Promise.all([
        setDoc(doc(fs, `tasks/${id('fin')}`), { domain: 'FIN', title: 'A' }),
        setDoc(doc(fs, `tasks/${id('vol')}`), { domain: 'VOL', title: 'B' }),
        setDoc(doc(fs, `tasks/${id('missing')}`), { title: 'C' }),
      ])
    })

    const { useTasks } = await import('../../../../src/hooks/useTasks')
    const { AuthProvider, React } = await getReactAuthProvider()
    const { result } = renderHook(() => useTasks(), {
      wrapper: ({ children }) => React.createElement(AuthProvider, null, children),
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const ids = result.current.tasks.map((t) => t.id)
    expect(ids).toContain(id('fin'))
    expect(ids).toContain(id('vol'))
    // Real Firestore's orderBy('domain') drops the doc missing `domain` —
    // the real hook's own returned state reflects this, unlike the
    // permissive V-layer mock.
    expect(ids).not.toContain(id('missing'))
  })

  it('TEST-L01.emulator.useBranch.array-contains-membership', async () => {
    const coordAUid = await signInAs('coordinator')
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore()
      await Promise.all([
        setDoc(doc(fs, `branches/${id('a')}`), { name: 'סניף א', type: 'food', city: 'ירושלים', coordinatorUids: [coordAUid] }),
        setDoc(doc(fs, `branches/${id('b')}`), { name: 'סניף ב', type: 'food', city: 'עיר', coordinatorUids: [id('someone-else')] }),
      ])
    })

    const { useBranch } = await import('../../../../src/hooks/useBranch')
    const { AuthProvider, React } = await getReactAuthProvider()
    const { result } = renderHook(() => useBranch(), {
      wrapper: ({ children }) => React.createElement(AuthProvider, null, children),
    })
    // AuthProvider resolves `appUser` asynchronously (auth state + user-doc
    // fetch); useBranch's effect fires once early with no `appUser.uid` and
    // sets `loading=false` without subscribing, then re-runs once appUser
    // resolves. Assert the actual data inside the same waitFor so a stale
    // early "loading=false" doesn't short-circuit the check.
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.branches.map((b) => b.id)).toEqual([id('a')])
    })
  })

  it('TEST-L01.emulator.useQuarterlyReports.branch-filter', async () => {
    await signInAs('admin')
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore()
      await Promise.all([
        setDoc(doc(fs, `quarterlyReports/${id('a1')}`), {
          branchId: id('branch-a'), branchType: 'food', quarter: 'Q3', year: 2026, submittedBy: id('coord-a'), data: {},
        }),
        setDoc(doc(fs, `quarterlyReports/${id('b1')}`), {
          branchId: id('branch-b'), branchType: 'food', quarter: 'Q1', year: 2026, submittedBy: id('coord-b'), data: {},
        }),
      ])
    })

    const { useQuarterlyReports } = await import('../../../../src/hooks/useQuarterlyReports')
    const { AuthProvider, React } = await getReactAuthProvider()
    const { result } = renderHook(() => useQuarterlyReports(id('branch-a')), {
      wrapper: ({ children }) => React.createElement(AuthProvider, null, children),
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const ids = result.current.reports.map((r) => r.id)
    expect(ids).toEqual([id('a1')])
  })
})
