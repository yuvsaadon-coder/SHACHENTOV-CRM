// TEST-T09 real-emulator confirmation variant (+R lane).
//
// Drives the REAL status-change writers (TaskDetailPage inline select,
// TasksPage inline select, DashboardPage inline select, KanbanCard inline
// select) through real user interaction, connected to a REAL Firestore
// Emulator client SDK (tests/requirements/support/emulator-firebase-alias.ts).
// Reads back the real persisted `tasks/{id}/history` subcollection to
// confirm which entrypoints actually record history on real infrastructure
// — no manual write proxy, no hand-authored payload standing in for a
// writer's real behavior.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, waitForPendingWrites } from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from '../../support/emulator-env'
import { createEmulatorFirebaseAlias } from '../../support/emulator-firebase-alias'
import { createEmulatorAdmin } from '../../support/emulator-admin'

const RUN_ID = `t09-${Date.now()}-${Math.random().toString(36).slice(2)}`

let env: RulesTestEnvironment
const alias = createEmulatorFirebaseAlias(`t09-alias-${RUN_ID}`)
const verifier = createEmulatorAdmin(`t09-verifier-${RUN_ID}`)

vi.mock('../../../../src/lib/firebase', () => ({
  auth: alias.auth,
  db: alias.db,
  storage: alias.storage,
}))

const { AuthProvider } = await import('../../../../src/context/AuthContext')
const { ToastProvider } = await import('../../../../src/context/ToastContext')
const { TaskDetailPage } = await import('../../../../src/pages/TaskDetailPage')
const { TasksPage } = await import('../../../../src/pages/TasksPage')
const { DashboardPage } = await import('../../../../src/pages/DashboardPage')
const { KanbanView } = await import('../../../../src/components/kanban/KanbanView')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')
const React = await import('react')

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
  await verifier.dispose()
})

afterEach(async () => {
  cleanup()
  await waitForPendingWrites(alias.db)
})

beforeEach(async () => {
  await env.clearFirestore()
})

async function signInRealHQ(role = 'FIN') {
  const cred = await signInAnonymously(alias.auth)
  const uid = cred.user.uid
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), {
      name: 'רכז בדיקה', email: `${uid}@requirements.invalid`, role, active: true,
    })
  })
  return uid
}

async function seedTask(taskId: string, uid: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `tasks/${taskId}`), {
      domain: 'FIN', category: 'תקציב', title: 'משימת בדיקה סטטוס', steps: '',
      frequency: 'חד-פעמי', startDate: null, endDate: null, holidayAnchor: null,
      involved: [], activator: null, contactRefs: [], status: 'בעבודה', notes: '',
      createdBy: uid, updatedBy: uid,
    })
  })
}

async function historyCount(taskId: string) {
  const snap = await verifier.firestore.collection(`tasks/${taskId}/history`).get()
  return snap.size
}

function withProviders(children: React.ReactNode, initialEntries: string[]) {
  return React.createElement(
    AuthProvider,
    null,
    React.createElement(
      ToastProvider,
      null,
      React.createElement(MemoryRouter, { initialEntries }, children),
    ),
  )
}

async function taskStatus(taskId: string): Promise<string | undefined> {
  const snap = await verifier.firestore.doc(`tasks/${taskId}`).get()
  return (snap.data() as Record<string, unknown> | undefined)?.status as string | undefined
}

describe('TEST-T09 (+R) emulator confirmation', () => {
  it('TEST-T09.emulator.detail-status-change-persists-history (compliant)', async () => {
    const uid = await signInRealHQ()
    const taskId = `${RUN_ID}-detail`
    await seedTask(taskId, uid)

    render(
      withProviders(
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/tasks/:id', element: React.createElement(TaskDetailPage) }),
        ),
        [`/tasks/${taskId}`],
      ),
    )
    await screen.findByText('משימת בדיקה סטטוס')
    const selects = await waitFor(() => {
      const found = screen.getAllByRole('combobox').filter((s) => (s as HTMLSelectElement).value === 'בעבודה')
      if (found.length === 0) throw new Error('status select not yet rendered')
      return found
    })
    await userEvent.setup().selectOptions(selects[0] as HTMLSelectElement, 'בוצע')

    // Independent Admin reads exclude the writer's latency-compensated cache.
    await waitFor(async () => expect(await taskStatus(taskId)).toBe('בוצע'))
    await waitFor(async () => expect(await historyCount(taskId)).toBe(1))
    await waitForPendingWrites(alias.db)
  })

  it('TEST-T09.emulator.list-quick-update-history-gap (G)', async () => {
    const uid = await signInRealHQ()
    const taskId = `${RUN_ID}-list`
    await seedTask(taskId, uid)

    render(
      withProviders(
        React.createElement(Routes, null, React.createElement(Route, { path: '/tasks', element: React.createElement(TasksPage) })),
        ['/tasks?monthFilter=false'],
      ),
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('משימת בדיקה סטטוס')
    })
    const selects = await waitFor(() => {
      const found = screen.getAllByRole('combobox').filter((s) => (s as HTMLSelectElement).value === 'בעבודה') as HTMLSelectElement[]
      if (found.length === 0) throw new Error('status select not yet rendered')
      return found
    })
    await userEvent.setup().selectOptions(selects[0], 'בוצע')

    // Positive-control precondition: confirm the underlying status write
    // actually persisted BEFORE drawing any conclusion from the history
    // count. Without this, an unrelated transient failure (e.g. an
    // ABORTED/PERMISSION_DENIED write, or a real task doc never being
    // reached at all) would look identical to "history omitted" — a
    // confirmed real gap must never be reported on top of a write that
    // silently never happened.
    await waitFor(async () => expect(await taskStatus(taskId)).toBe('בוצע'))

    // Requirement: the status change must record history. Real gap
    // expected: TasksPage's inline status handler writes only the task.
    await waitFor(async () => expect(await historyCount(taskId)).toBe(1))
  })

  it('TEST-T09.emulator.dashboard-quick-update-history-gap (G)', async () => {
    const uid = await signInRealHQ('admin')
    const taskId = `${RUN_ID}-dash`
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `tasks/${taskId}`), {
        domain: 'FIN', category: 'תקציב', title: 'משימת בדיקה סטטוס', steps: '',
        frequency: 'שוטף', startDate: null, endDate: null, holidayAnchor: null,
        involved: ['רכז בדיקה'], activator: null, contactRefs: [], status: 'בעבודה', notes: '',
        createdBy: uid, updatedBy: uid,
      })
    })

    render(
      withProviders(
        React.createElement(Routes, null, React.createElement(Route, { path: '/', element: React.createElement(DashboardPage) })),
        ['/'],
      ),
    )
    // DashboardPage's task lists (overdue/myTasks) default to the current
    // real-world month; the fixture's fixed `startDate: null` never
    // matches, independent of when this suite actually runs — switch to
    // the "all time" filter so the seeded task is genuinely reachable.
    await userEvent.setup().click(await screen.findByRole('button', { name: 'כל הזמן' }))
    await waitFor(() => {
      expect(document.body.textContent).toContain('משימת בדיקה סטטוס')
    })
    const selects = await waitFor(() => {
      const found = screen.getAllByRole('combobox').filter((s) => (s as HTMLSelectElement).value === 'בעבודה') as HTMLSelectElement[]
      if (found.length === 0) throw new Error('status select not yet rendered')
      return found
    })
    await userEvent.setup().selectOptions(selects[0], 'בוצע')

    await waitFor(async () => expect(await taskStatus(taskId)).toBe('בוצע'))
    await waitFor(async () => expect(await historyCount(taskId)).toBe(1))
  })

  it('TEST-T09.emulator.kanban-inline-select-history-gap (G)', async () => {
    const uid = await signInRealHQ()
    const taskId = `${RUN_ID}-kanban`
    await seedTask(taskId, uid)

    const { Timestamp } = await import('firebase/firestore')
    const now = Timestamp.fromDate(new Date('2026-09-06T12:00:00'))
    const task: import('../../../../src/types').Task = {
      id: taskId, domain: 'FIN', category: 'תקציב', title: 'משימת בדיקה סטטוס', steps: '',
      frequency: 'חד-פעמי', startDate: now, endDate: now, holidayAnchor: null,
      involved: [], activator: null, contactRefs: [], status: 'בעבודה', notes: '',
      createdAt: now, updatedAt: now, createdBy: uid, updatedBy: uid,
    }
    render(withProviders(React.createElement(KanbanView, { tasks: [task] }), ['/']))
    await screen.findByText('משימת בדיקה סטטוס')
    const selects = await waitFor(() => {
      const found = screen.getAllByRole('combobox').filter((s) => (s as HTMLSelectElement).value === 'בעבודה') as HTMLSelectElement[]
      if (found.length === 0) throw new Error('status select not yet rendered')
      return found
    })
    await userEvent.setup().selectOptions(selects[0], 'בוצע')

    await waitFor(async () => expect(await taskStatus(taskId)).toBe('בוצע'))
    await waitFor(async () => expect(await historyCount(taskId)).toBe(1))
  })
})
