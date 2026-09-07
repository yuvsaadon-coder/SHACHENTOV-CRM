// @vitest-environment jsdom
// TEST-L05 — two-client convergence, detail-live, and research-live.
//
// The `// @vitest-environment jsdom` directive
// overrides vitest.rules.config.ts's project-level `environment: 'node'`
// so this single file can mount real React components/hooks while the
// rest of the emulator lane stays on Node.
//
// Family split (TEST-PLAN.md §6.1 L05 row):
//   L05.realtime.{tasks,contacts,reports,hq-knowledge} (A):
//     named subscribed consumer updates/reconnects. Predicted GREEN
//     (P03–P05 already implement listeners).
//   L05.detail-live (G):
//     open task detail updates live. Predicted RED — TaskDetailPage's
//     main task document uses getDoc (src/pages/TaskDetailPage.tsx:~85)
//     not onSnapshot, so client B's open detail view does NOT converge
//     when client A updates the same task.
//   L05.research-live (G):
//     maintained research reaches open library. Predicted RED — the
//     research library page consumes a static KNOWLEDGE_CATALOG array,
//     not a live Firestore listener.
//
// Two independent SDK clients are required:
//   - Client A (writer): a second real @firebase/firestore instance
//     connected to the emulator via connectFirestoreEmulator.
//   - Client B (consumer): the REAL production hook/component mounted
//     via @testing-library/react and served by src/lib/firebase's real
//     `db` (also connected to the emulator through the requirements-
//     lane bootstrap).
//
// This shape is intentionally NOT achievable with the component-lane
// firestoreMock: that mock is a single in-process fake, not two
// independent SDK connections, so realtime convergence can only be
// proved against a real Firestore emulator.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
// initializeApp lives on firebase/app; client A needs an INDEPENDENT
// second app distinct from client B's aliased production app below.
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously, signOut, type Auth } from 'firebase/auth'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from '../../support/emulator-env'
import { createEmulatorFirebaseAlias } from '../../support/emulator-firebase-alias'

const RUN_ID = `l05-${Date.now()}-${Math.random().toString(36).slice(2)}`
const id = (name: string) => `${RUN_ID}-${name}`

let env: RulesTestEnvironment
let clientAApp: FirebaseApp
let clientA: Firestore
let clientAAuth: Auth

// Client B: the real production hooks/components import `{ db, auth }`
// from `src/lib/firebase`. That module is replaced, only at this test's
// module-resolution boundary, with a second real (not mocked) Firebase
// app bound to the same loopback emulators — this is the "consumer"
// connection the requirement's two-independent-SDK-client GIVEN needs.
const clientBAlias = createEmulatorFirebaseAlias(`l05-clientB-${RUN_ID}`)
vi.mock('../../../../src/lib/firebase', () => ({
  auth: clientBAlias.auth,
  db: clientBAlias.db,
  storage: clientBAlias.storage,
}))

// Real production hooks — client B (the CONSUMER) mounts these against
// the aliased `db` above, which is genuinely connected to the emulator.
// Imported dynamically (inside each test body) rather than statically:
// static imports of these files (which transitively import the mocked
// `src/lib/firebase`) are hoisted by the JS spec ABOVE the `const
// clientBAlias = ...` below, so a static import here would throw
// "Cannot access 'clientBAlias' before initialization" the moment the
// vi.mock factory runs.
import React from 'react'

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

  // Client A: a fully independent real Firebase app/connection — the
  // "writer" side of the two-client convergence requirement.
  clientAApp = initializeApp(
    { projectId: PROJECT_ID, apiKey: 'demo-api-key' },
    `l05-writer-${RUN_ID}`
  )
  clientA = getFirestore(clientAApp)
  connectFirestoreEmulator(clientA, EMULATORS.firestore.host, EMULATORS.firestore.port)
  clientAAuth = getAuth(clientAApp)
  connectAuthEmulator(clientAAuth, `http://${EMULATORS.auth.host}:${EMULATORS.auth.port}`, { disableWarnings: true })
})

afterAll(async () => {
  await deleteApp(clientAApp).catch(() => undefined)
  await clientBAlias.dispose()
  await env?.cleanup()
})

async function signInClientB(role = 'admin') {
  const cred = await signInAnonymously(clientBAlias.auth)
  const uid = cred.user.uid
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), {
      name: 'צרכן בדיקה', email: `${uid}@requirements.invalid`, role, active: true,
    })
  })
  return uid
}

// Client A signs in fresh (real Auth Emulator identity, not a security-
// rules bypass) with whichever real-world role the test's write actually
// needs — e.g. `quarterlyReports` create requires isCoordinator() +
// coordinatesBranch(), which is mutually exclusive with the isHQ() role
// the other three realtime writes need.
async function signInClientAAs(role: string, branchId?: string) {
  if (clientAAuth.currentUser) await signOut(clientAAuth)
  const cred = await signInAnonymously(clientAAuth)
  const uid = cred.user.uid
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), {
      name: 'כותב בדיקה', email: `${uid}@requirements.invalid`, role, active: true,
    })
    if (branchId) {
      await setDoc(doc(ctx.firestore(), `branches/${branchId}`), {
        name: 'סניף בדיקה', type: 'food', city: 'עיר', coordinatorUids: [uid],
      })
    }
  })
  return uid
}

function withAuthProvider(children: React.ReactNode, AuthProvider: (props: { children: React.ReactNode }) => React.JSX.Element) {
  return React.createElement(AuthProvider, null, children)
}

beforeEach(async () => {
  await env.clearFirestore()
})

afterEach(() => {
  cleanup()
})

describe('TEST-L05 two-client convergence', () => {
  it('TEST-L05.realtime.tasks', async () => {
    await signInClientB()
    await signInClientAAs('admin')
    const { useTasks } = await import('../../../../src/hooks/useTasks')
    // Client A writes a task; client B (mounted useTasks) observes the
    // new task without refresh.
    const { result } = renderHook(() => useTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const initialCount = result.current.tasks.length

    // Client A writes.
    await act(async () => {
      await setDoc(doc(clientA, `tasks/${id('t1')}`), {
        domain: 'FIN', title: 'from-A', createdBy: 'writer',
      })
    })

    await waitFor(() => expect(result.current.tasks.length).toBe(initialCount + 1))
    expect(result.current.tasks.map((t) => t.id)).toContain(id('t1'))
  })

  it('TEST-L05.realtime.contacts', async () => {
    await signInClientB()
    await signInClientAAs('admin')
    const { useContacts } = await import('../../../../src/hooks/useContacts')
    const { result } = renderHook(() => useContacts())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const initial = result.current.contacts.length
    await act(async () => {
      await setDoc(doc(clientA, `contacts/${id('c1')}`), { name: 'from-A' })
    })
    await waitFor(() => expect(result.current.contacts.length).toBe(initial + 1))
  })

  it('TEST-L05.realtime.reports', async () => {
    await signInClientB()
    const branchId = id('branch-a')
    const writerUid = await signInClientAAs('coordinator', branchId)
    const { useAllQuarterlyReports } = await import('../../../../src/hooks/useAllQuarterlyReports')
    const { result } = renderHook(() => useAllQuarterlyReports())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const initial = result.current.reports.length
    await act(async () => {
      await setDoc(doc(clientA, `quarterlyReports/${id('r1')}`), {
        branchId, branchType: 'food', quarter: 'Q3', year: 2026,
        submittedBy: writerUid, data: {},
      })
    })
    await waitFor(() => expect(result.current.reports.length).toBe(initial + 1))
  })

  it('TEST-L05.realtime.hq-knowledge', async () => {
    await signInClientB()
    await signInClientAAs('admin')
    const { useHQKnowledge } = await import('../../../../src/hooks/useHQKnowledge')
    const { result } = renderHook(() => useHQKnowledge())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const initial = result.current.items.length
    await act(async () => {
      await addDoc(collection(clientA, 'hq_knowledge'), {
        domain: 'FIN', category: 'handover', title: 'from-A', content: 'x', tags: [],
      })
    })
    await waitFor(() => expect(result.current.items.length).toBe(initial + 1))
  })

  it('TEST-L05.detail-live (G) — an open task detail view must reflect another client\'s update without a manual refresh', async () => {
    // TaskDetailPage.tsx loads the main task doc via `getDoc` — a
    // one-shot read, not a listener. The requirement is that client B's
    // already-open detail view converges when client A updates the same
    // task; asserted directly here (real gap expected).
    await signInClientB()
    await signInClientAAs('admin')
    const { MemoryRouter, Routes, Route } = await import('react-router-dom')
    const { TaskDetailPage } = await import('../../../../src/pages/TaskDetailPage')
    const { ToastProvider } = await import('../../../../src/context/ToastContext')
    const { AuthProvider } = await import('../../../../src/context/AuthContext')
    const { render, screen } = await import('@testing-library/react')

    await setDoc(doc(clientA, `tasks/${id('detail')}`), {
      domain: 'FIN', title: 'original title', createdBy: 'writer',
      status: 'לא בוצע', frequency: 'חד-פעמי',
    })

    render(
      withAuthProvider(
        React.createElement(
          ToastProvider,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: [`/tasks/${id('detail')}`] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, { path: '/tasks/:id', element: React.createElement(TaskDetailPage) }),
            ),
          ),
        ),
        AuthProvider,
      ),
    )
    await waitFor(() => expect(screen.queryByText(/original title/)).toBeTruthy())

    await updateDoc(doc(clientA, `tasks/${id('detail')}`), { title: 'updated by A' })

    // Requirement: B's open detail view converges without a refresh.
    await waitFor(() => expect(screen.queryByText(/updated by A/)).toBeTruthy())
  })

  it('TEST-L05.research-live (G) — maintained research content must reach an already-open knowledge library without a refresh', async () => {
    // Requirement: newly-created/maintained research reaches the open
    // library live. Asserted directly (real gap expected — the library
    // page reads a static bundled catalog, not Firestore).
    await signInClientAAs('admin')
    const { render, screen } = await import('@testing-library/react')
    const { MemoryRouter } = await import('react-router-dom')
    const { KnowledgeLibraryPage } = await import('../../../../src/pages/KnowledgeLibraryPage')

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/knowledge'] },
        React.createElement(KnowledgeLibraryPage),
      ),
    )
    await new Promise((r) => setTimeout(r, 100))

    const sentinel = `L05-RESEARCH-SENTINEL-${id('s')}`
    await addDoc(collection(clientA, 'knowledge_articles'), {
      titleHe: sentinel, summary: 'from A', lang: 'he',
    })

    await waitFor(() => expect(screen.queryByText(new RegExp(sentinel))).toBeTruthy())
  })
})
