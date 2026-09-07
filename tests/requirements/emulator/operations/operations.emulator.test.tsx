// @vitest-environment jsdom
import '../../support/knowledge-vite-env'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { signInWithCustomToken, signOut } from 'firebase/auth'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from '../../support/emulator-env'
import { connectClientEmulators } from '../../support/knowledge-client-emulator'
import { adminApp } from '../../support/knowledge-admin'
import { auth } from '../../../../src/lib/firebase'
import { BranchesPage } from '../../../../src/pages/BranchesPage'
import { ReportQuestionsAdminPage } from '../../../../src/pages/admin/ReportQuestionsAdminPage'
import { PortalReport } from '../../../../src/pages/portal/PortalReport'

const firestoreFault = vi.hoisted(() => ({
  enabled: false,
  updateCalls: 0,
  injected: false,
  firstAck: null as Promise<unknown> | null,
}))
const b03BranchHook = vi.hoisted(() => ({
  enabled: false,
  call: 0,
  snapshots: [] as Array<Array<Record<string, unknown>>>,
  writes: [] as Array<Promise<unknown>>,
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const isUsersQuery = (ref: unknown) => {
    const r = ref as { _query?: { path?: { canonicalString?: () => string; segments?: string[] } }; _path?: { segments?: string[] } }
    const canonical = r._query?.path?.canonicalString?.() ?? r._query?.path?.segments?.join('/') ?? r._path?.segments?.join('/') ?? ''
    return canonical === 'users' || canonical.endsWith('/users')
  }
  return {
    ...actual,
    getDocs: vi.fn((ref: Parameters<typeof actual.getDocs>[0]) => {
      if (b03BranchHook.enabled && isUsersQuery(ref)) {
        return Promise.resolve({
          docs: ['coord-a', 'coord-b', 'coord-c'].map((name) => ({
            id: id(name),
            data: () => ({
              name: name === 'coord-a' ? 'רכז א' : name === 'coord-b' ? 'רכז ב' : 'רכז ג',
              email: `${name}@example.test`,
              role: 'coordinator',
              active: true,
            }),
          })),
        } as Awaited<ReturnType<typeof actual.getDocs>>)
      }
      return actual.getDocs(ref)
    }),
    updateDoc: vi.fn(async (...args: Parameters<typeof actual.updateDoc>) => {
      firestoreFault.updateCalls += 1
      if (firestoreFault.enabled && firestoreFault.updateCalls === 2) {
        if (firestoreFault.firstAck) await firestoreFault.firstAck
        firestoreFault.injected = true
        return new Promise<never>(() => undefined)
      }
      const result = actual.updateDoc(...args)
      if (b03BranchHook.enabled) {
        b03BranchHook.writes.push(result)
      }
      if (firestoreFault.enabled && firestoreFault.updateCalls === 1) {
        firestoreFault.firstAck = result
      }
      return result
    }),
  }
})

vi.mock('../../../../src/hooks/useBranch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/hooks/useBranch')>()
  return {
    ...actual,
    useAllBranches: () => {
      if (!b03BranchHook.enabled) return actual.useAllBranches()
      const snapshot = b03BranchHook.snapshots[Math.min(b03BranchHook.call, b03BranchHook.snapshots.length - 1)] ?? []
      b03BranchHook.call += 1
      return { branches: snapshot, loading: false }
    },
  }
})

const RUN_ID = `ops-${Date.now()}-${Math.random().toString(36).slice(2)}`
const id = (name: string) => `${RUN_ID}-${name}`
const path = (collectionName: string, name: string) => `${collectionName}/${id(name)}`

let env: RulesTestEnvironment
const toast = vi.fn()
const authBoundary = vi.hoisted(() => ({
  appUser: { uid: '', name: '', role: 'admin', active: true } as { uid: string; name: string; role: string; active: boolean },
}))

vi.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    appUser: authBoundary.appUser,
    firebaseUser: { uid: authBoundary.appUser.uid, getIdToken: async () => 'synthetic-token' },
    loading: false,
    signIn: vi.fn(),
    logOut: vi.fn(),
  }),
}))

vi.mock('../../../../src/context/ToastContext', () => ({
  useToast: () => ({ toast }),
}))

function ctl(label: string, root: HTMLElement = document.body) {
  const labelNode = within(root).getByText(label)
  const control = labelNode.parentElement?.querySelector('input,select,textarea') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  if (!control) throw new Error(`No control next to ${label}`)
  return control
}

function nearestSelectRoot(node: HTMLElement) {
  let current: HTMLElement | null = node
  while (current && !current.querySelector('select')) current = current.parentElement
  if (!current) throw new Error('No selectable row found')
  return current
}

function portal(ui: React.ReactElement, branch: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ branch }} />}>
          <Route path="/" element={ui} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

async function seedDoc(collectionName: string, name: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path(collectionName, name)), data)
  })
}

async function cleanupRunDocs() {
  if (!env) return
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore()
    for (const collectionName of ['users', 'branches', 'reportQuestions', 'quarterlyReports']) {
      const snap = await getDocs(collection(fs, collectionName))
      await Promise.all(snap.docs
        .filter((d) => d.id.startsWith(RUN_ID) || JSON.stringify(d.data()).includes(RUN_ID))
        .map((d) => deleteDoc(doc(fs, collectionName, d.id))))
    }
  })
}

async function signInClient(uid: string, name: string, role: string) {
  authBoundary.appUser = { uid: id(uid), name, role, active: true }
  const token = await getAdminAuth(adminApp()).createCustomToken(id(uid))
  await signInWithCustomToken(auth, token)
  await waitFor(() => expect(auth.currentUser?.uid).toBe(id(uid)))
}

beforeAll(async () => {
  assertEmulatorEnvironment()
  connectClientEmulators()
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATORS.firestore.host,
      port: EMULATORS.firestore.port,
      rules: readFileSync(join('tests', 'requirements', '.cache', 'firestore.rules'), 'utf8'),
    },
  })
})

beforeEach(async () => {
  toast.mockClear()
  firestoreFault.enabled = false
  firestoreFault.updateCalls = 0
  firestoreFault.injected = false
  firestoreFault.firstAck = null
  b03BranchHook.enabled = false
  b03BranchHook.call = 0
  b03BranchHook.snapshots = []
  b03BranchHook.writes = []
  if (auth.currentUser) await signOut(auth)
  await cleanupRunDocs()
})

afterEach(async () => {
  cleanup()
  await cleanupRunDocs()
})

afterAll(async () => {
  await cleanupRunDocs()
  await env?.cleanup()
})

describe('TEST-operations emulator-backed production flows', () => {
  it('TEST-B03.atomic-coordinator-links [G] uses two real BranchesPage writers and preserves all committed links', async () => {
    await Promise.all([
      seedDoc('users', 'admin-a', { name: 'Admin A', email: 'admin@example.test', role: 'admin', active: true }),
      seedDoc('users', 'coord-a', { name: 'רכז א', email: 'a@example.test', role: 'coordinator', active: true }),
      seedDoc('users', 'coord-b', { name: 'רכז ב', email: 'b@example.test', role: 'coordinator', active: true }),
      seedDoc('users', 'coord-c', { name: 'רכז ג', email: 'c@example.test', role: 'coordinator', active: true }),
      seedDoc('branches', 'branch-a', {
        name: 'סניף א',
        type: 'food',
        city: 'ירושלים',
        coordinatorUids: [id('coord-a')],
        coordinatorNames: ['רכז א'],
      }),
    ])
    await signInClient('admin-a', 'Admin A', 'admin')
    b03BranchHook.enabled = true
    b03BranchHook.call = 0
    b03BranchHook.snapshots = [[{
      id: id('branch-a'),
      name: 'סניף א',
      type: 'food',
      city: 'ירושלים',
      coordinatorUids: [id('coord-a')],
      coordinatorNames: ['רכז א'],
    }]]

    const first = render(<MemoryRouter><BranchesPage /></MemoryRouter>)
    const second = render(<MemoryRouter><BranchesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText(/קישור רכזים/)).toHaveLength(2))

    fireEvent.click(within(first.container).getByRole('button', { name: /קישור רכזים/ }))
    fireEvent.click(within(second.container).getByRole('button', { name: /קישור רכזים/ }))
    await waitFor(() => expect(screen.getAllByText('רכז ב').length).toBeGreaterThan(0))

    const firstDialog = within(first.container).getByText('קישור רכזים לסניפים').closest('[dir="rtl"]') as HTMLElement
    const secondDialog = within(second.container).getByText('קישור רכזים לסניפים').closest('[dir="rtl"]') as HTMLElement
    const firstCoord = nearestSelectRoot(within(firstDialog).getByText('רכז ב') as HTMLElement)
    const secondCoord = nearestSelectRoot(within(secondDialog).getByText('רכז ג') as HTMLElement)

    const user = userEvent.setup()
    await user.selectOptions(within(firstCoord).getByRole('combobox'), id('branch-a'))
    await user.selectOptions(within(secondCoord).getByRole('combobox'), id('branch-a'))
    await waitFor(() => expect(b03BranchHook.writes.length).toBe(2))
    await Promise.allSettled(b03BranchHook.writes)

    const snap = await waitFor(async () => {
      const current = await getDoc(doc(env.authenticatedContext(id('coord-a')).firestore(), path('branches', 'branch-a')))
      expect(current.data()?.coordinatorUids).toContain(id('coord-c'))
      return current
    })
    expect(snap.data()?.coordinatorUids).toEqual(expect.arrayContaining([id('coord-a'), id('coord-b'), id('coord-c')]))
    expect(snap.data()?.coordinatorNames).toEqual(expect.arrayContaining(['רכז א', 'רכז ב', 'רכז ג']))
  })

  it('TEST-Q06.current-concurrent-submissions-ui [C] uses two real PortalReport forms and characterizes duplicate creates', async () => {
    await Promise.all([
      seedDoc('users', 'coord-a', { name: 'רכז א', email: 'a@example.test', role: 'coordinator', active: true }),
      seedDoc('branches', 'branch-a', { name: 'סניף א', type: 'food', city: 'ירושלים', coordinatorUids: [id('coord-a')] }),
      seedDoc('reportQuestions', 'q1', { branchType: 'food', key: id('challenge'), label: 'אתגר', section: 'כללי', type: 'text', firstReportOnly: false, order: 1 }),
    ])
    await signInClient('coord-a', 'רכז א', 'coordinator')
    const branch = { id: id('branch-a'), name: 'סניף א', type: 'food', city: 'ירושלים', coordinatorUids: [id('coord-a')] }

    const first = portal(<PortalReport />, branch)
    await waitFor(() => expect(ctl('אתגר', first.container)).toBeInTheDocument())
    const second = portal(<PortalReport />, branch)
    await waitFor(() => expect(ctl('אתגר', second.container)).toBeInTheDocument())
    const expectedQuarter = ctl('רבעון', first.container).value
    const expectedYear = Number(ctl('שנה', first.container).value)
    fireEvent.change(ctl('אתגר', first.container), { target: { value: 'ראשון' } })
    fireEvent.change(ctl('אתגר', second.container), { target: { value: 'שני' } })
    fireEvent.click(within(first.container).getByRole('button', { name: 'שלח דיווח' }))
    fireEvent.click(within(second.container).getByRole('button', { name: 'שלח דיווח' }))

    await waitFor(async () => {
      const snap = await getDocs(query(
        collection(env.authenticatedContext(id('coord-a')).firestore(), 'quarterlyReports'),
        where('branchId', '==', id('branch-a')),
        where('quarter', '==', expectedQuarter),
        where('year', '==', expectedYear),
      ))
      expect(snap.docs).toHaveLength(2)
    })
  })

  it('TEST-Q07.atomic-question-reorder [G] uses real ReportQuestionsAdminPage reorder and leaves no duplicate order after writer failure', async () => {
    await Promise.all([
      seedDoc('users', 'admin-a', { name: 'Admin A', email: 'admin@example.test', role: 'admin', active: true }),
      seedDoc('reportQuestions', 'q1', { branchType: 'food', key: id('a'), label: 'א', section: 'כללי', type: 'text', firstReportOnly: false, order: 1 }),
      seedDoc('reportQuestions', 'q2', { branchType: 'food', key: id('b'), label: 'ב', section: 'כללי', type: 'text', firstReportOnly: false, order: 2 }),
    ])
    await signInClient('admin-a', 'Admin A', 'admin')
    firestoreFault.enabled = true
    render(<MemoryRouter><ReportQuestionsAdminPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('א')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'הזז למטה' })[0])

    await waitFor(async () => {
      expect(firestoreFault.updateCalls).toBeGreaterThanOrEqual(2)
      expect(firestoreFault.injected).toBe(true)
      const snap = await getDocs(query(
        collection(env.authenticatedContext(id('admin-a')).firestore(), 'reportQuestions'),
        where('branchType', '==', 'food'),
      ))
      const ordersByKey = Object.fromEntries(snap.docs
        .filter((d) => [id('a'), id('b')].includes(d.data().key as string))
        .map((d) => [d.data().key, d.data().order]))
      expect(new Set(Object.values(ordersByKey))).toEqual(new Set([1, 2]))
      expect(ordersByKey).not.toEqual({ [id('a')]: 1, [id('b')]: 2 })
      expect(toast).toHaveBeenCalledWith(expect.stringMatching(/שגיאה|נכשל/), 'error')
    })
  })
})
