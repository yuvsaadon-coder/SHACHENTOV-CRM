// TEST-T09 — Status-change history recording across four entrypoints + rejected update.
// Requirements: T10a / E04 / T05c. Layer V. Family classification: G. Each
// case asserts the REQUIRED behavior (a real status change must record a
// history entry; a rejected change must not) and reports the actual result:
//   - TEST-T09.detail-status-change-writes-history   — TaskDetailPage (compliant).
//   - TEST-T09.list-quick-update-writes-history       — TasksPage (gap: no history).
//   - TEST-T09.dashboard-quick-update-writes-history   — DashboardPage (gap: no history).
//   - TEST-T09.kanban-inline-select-writes-history     — KanbanCard select (gap: no history).
//   - TEST-T09.rejected-update-no-false-history        — rejected update must not
//     leave a false-successful history entry (gap: history is written before
//     the task update, so it lands even when the update itself is rejected).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

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
import { IDENTITIES, TASKS, docSnap } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { ToastProvider } from '../../../../src/context/ToastContext'
import { TaskDetailPage } from '../../../../src/pages/TaskDetailPage'
import { TasksPage } from '../../../../src/pages/TasksPage'
import { DashboardPage } from '../../../../src/pages/DashboardPage'
import { KanbanView } from '../../../../src/components/kanban/KanbanView'

const HQ = { uid: IDENTITIES.hqFin.uid, email: IDENTITIES.hqFin.email }
const HQ_PROFILE = {
  name: IDENTITIES.hqFin.name,
  email: IDENTITIES.hqFin.email,
  role: 'admin', // use admin so all pages are visible without domain-scoping side-effects
  active: true,
}
const TASK_ID = TASKS.fin.id
const TASK_DOC = TASKS.fin
const TASK_DOC_DATA = (() => {
  const { id: _id, ...rest } = TASK_DOC
  return rest
})()

function withProviders(children: React.ReactNode, initialEntries: string[] = ['/']) {
  return (
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

async function primeAuth() {
  firestoreMock.setDocValue(`users/${HQ.uid}`, HQ_PROFILE)
  authMock.currentUser = HQ
}

beforeEach(() => {
  firestoreMock.reset()
  authMock.reset()
})

// ── Case 1: TaskDetailPage inline status change → writes history ────────────
describe('TEST-T09 — status change history recording (V)', () => {
  it('TEST-T09.detail-status-change-writes-history (G, predicted PASS) — TaskDetailPage inline status control writes both a history subcollection entry AND the task updateDoc', async () => {
    await primeAuth()
    firestoreMock.setDocValue(`tasks/${TASK_ID}`, TASK_DOC_DATA)

    render(
      withProviders(
        <Routes>
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
        </Routes>,
        [`/tasks/${TASK_ID}`],
      ),
    )

    // Feed nested subs + subtask query so page settles past initial spinner.
    await waitFor(() => expect(firestoreMock.liveCount(`tasks/${TASK_ID}/comments`)).toBe(1))
    firestoreMock.emitQuery(`tasks/${TASK_ID}/comments`, [])
    firestoreMock.emitQuery(`tasks/${TASK_ID}/attachments`, [])
    firestoreMock.emitQuery(`tasks/${TASK_ID}/history`, [])
    await waitFor(() => expect(firestoreMock.liveCount('tasks')).toBeGreaterThan(0))
    firestoreMock.emitQuery('tasks', [])

    await screen.findByText(TASKS.fin.title)

    // The status <select> at the top of the page is bound to updateStatusInline.
    // TaskDetailPage.tsx:295-303 renders it with all STATUS_LABELS options.
    // We locate it by initial value 'בעבודה' and change to 'בוצע'.
    const selects = screen.getAllByRole('combobox')
    const statusSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === 'בעבודה',
    ) as HTMLSelectElement
    expect(statusSelect).toBeTruthy()

    firestoreMock.writeCalls.length = 0
    await userEvent.setup().selectOptions(statusSelect, 'בוצע')

    // Both writes must land: addDoc into history + updateDoc on task.
    await waitFor(() => {
      const hist = firestoreMock.writeCalls.find(
        (w) => w.kind === 'addDoc' && w.path === `tasks/${TASK_ID}/history`,
      )
      const upd = firestoreMock.writeCalls.find(
        (w) => w.kind === 'updateDoc' && w.path === `tasks/${TASK_ID}`,
      )
      expect(hist, 'history subcollection addDoc must occur').toBeTruthy()
      expect(upd, 'task updateDoc must occur').toBeTruthy()
    })

    // The history entry has the required shape: actor/oldValue/newValue/timestamp.
    const hist = firestoreMock.writeCalls.find(
      (w) => w.kind === 'addDoc' && w.path === `tasks/${TASK_ID}/history`,
    )!
    const payload = hist.data as {
      field?: string; oldValue?: string; newValue?: string;
      changedBy?: string; changedAt?: unknown
    }
    expect(payload.field).toBe('status')
    expect(payload.oldValue).toBe('בעבודה')
    expect(payload.newValue).toBe('בוצע')
    expect(payload.changedBy).toBe(HQ_PROFILE.name)
    expect(payload.changedAt).toBeTruthy()
  })

  // ── Case 2: TasksPage list quick-update → history required ──────────────
  it('TEST-T09.list-quick-update-writes-history (G) — TasksPage inline status change must record a history entry alongside the task update', async () => {
    await primeAuth()

    render(withProviders(<Routes><Route path="/tasks" element={<TasksPage />} /></Routes>, ['/tasks']))

    // TasksPage useTasks listens on `tasks` (query on collection).
    await waitFor(() => expect(firestoreMock.liveCount('tasks')).toBeGreaterThan(0))
    firestoreMock.emitQuery('tasks', [docSnap(TASK_DOC)])

    // Row renders with initial status 'בעבודה'. TasksPage renders BOTH a
    // desktop table (hidden md:block) and mobile cards (md:hidden) — each
    // duplicates the task title, so use findAllByText to accept both.
    const titles = await screen.findAllByText(TASKS.fin.title)
    expect(titles.length).toBeGreaterThanOrEqual(1)
    const selects = screen.getAllByRole('combobox').filter(
      (s) => (s as HTMLSelectElement).value === 'בעבודה',
    ) as HTMLSelectElement[]
    // Domain/status/frequency filters may also have combobox roles; the one
    // whose value is 'בעבודה' is the row's status select.
    expect(selects.length).toBeGreaterThan(0)

    firestoreMock.writeCalls.length = 0
    await userEvent.setup().selectOptions(selects[0], 'בוצע')

    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'updateDoc' && w.path === `tasks/${TASK_ID}`,
      )).toBe(true)
    })
    // Requirement: the status change must record a history entry.
    const hist = firestoreMock.writeCalls.find(
      (w) => w.kind === 'addDoc' && w.path.startsWith(`tasks/${TASK_ID}/history`),
    )
    expect(hist, 'TasksPage quick-update must write history (TasksPage.tsx status handler)').toBeTruthy()
  })

  // ── Case 3: DashboardPage quick-update → history required ────────────────
  it('TEST-T09.dashboard-quick-update-writes-history (G) — DashboardPage inline status change must record a history entry', async () => {
    await primeAuth()

    render(withProviders(<Routes><Route path="/" element={<DashboardPage />} /></Routes>, ['/']))

    // useTasks + useRoles listeners — DashboardPage subscribes to both.
    await waitFor(() => expect(firestoreMock.liveCount('tasks')).toBeGreaterThan(0))
    // The task must appear in either the "overdue" panel or the "my tasks"
    // panel of DashboardPage (only these lists render inline status selects).
    // Use an ad-hoc task with .involved including the signed-in HQ profile
    // name so DashboardPage.tsx:139-142 places it in myTasks. Frequency
    // 'שוטף' guarantees period-filter membership regardless of system clock.
    const TASK_INVOLVED = {
      ...TASK_DOC,
      frequency: 'שוטף' as const,
      involved: [HQ_PROFILE.name],
    }
    firestoreMock.emitQuery('tasks', [docSnap(TASK_INVOLVED)])
    if (firestoreMock.liveCount('roles') > 0) {
      firestoreMock.emitQuery('roles', [])
    }

    const titles = await screen.findAllByText(TASKS.fin.title)
    expect(titles.length).toBeGreaterThanOrEqual(1)
    const selects = screen.getAllByRole('combobox').filter(
      (s) => (s as HTMLSelectElement).value === 'בעבודה',
    ) as HTMLSelectElement[]
    expect(selects.length).toBeGreaterThan(0)

    firestoreMock.writeCalls.length = 0
    await userEvent.setup().selectOptions(selects[0], 'בוצע')

    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'updateDoc' && w.path === `tasks/${TASK_ID}`,
      )).toBe(true)
    })
    const hist = firestoreMock.writeCalls.find(
      (w) => w.kind === 'addDoc' && w.path.startsWith(`tasks/${TASK_ID}/history`),
    )
    expect(hist, 'DashboardPage quick-update must write history (DashboardPage.tsx status handler)').toBeTruthy()
  })

  // ── Case 4: KanbanCard inline status select → history required ──────────
  //
  // dnd-kit's PointerSensor drag gesture cannot be driven reliably from
  // jsdom (no real pointer-capture/collision-detection pipeline); calling
  // its internal onDragEnd handler directly would fake the gesture, which
  // is prohibited. This test instead drives the real, already-keyboard-
  // and-mouse-operable inline status <select> KanbanCard.tsx renders on
  // each card — a genuine runtime action available on the Kanban surface —
  // and asserts the SAME requirement (full change history) for it. The
  // real dnd-kit drag path remains a distinct, separately-owed browser-lane
  // case.
  it('TEST-T09.kanban-inline-select-writes-history (G) — changing a task status via the Kanban card select must record a history entry', async () => {
    await primeAuth()

    render(
      withProviders(<KanbanView tasks={[{ ...TASK_DOC } as unknown as import('../../../../src/types').Task]} />),
    )

    await screen.findByText(TASKS.fin.title)

    const cardStatusSelects = screen.getAllByRole('combobox').filter(
      (s) => (s as HTMLSelectElement).value === 'בעבודה',
    ) as HTMLSelectElement[]
    expect(cardStatusSelects.length).toBe(1)

    firestoreMock.writeCalls.length = 0
    await userEvent.setup().selectOptions(cardStatusSelects[0], 'בוצע')

    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'updateDoc' && w.path === `tasks/${TASK_ID}`,
      )).toBe(true)
    })
    const hist = firestoreMock.writeCalls.find(
      (w) => w.kind === 'addDoc' && w.path.startsWith(`tasks/${TASK_ID}/history`),
    )
    expect(hist, 'Kanban card status change must write history (KanbanCard.tsx select handler)').toBeTruthy()
  })

  // ── Case 5: rejected update path ───────────────────────────────────────────
  it('TEST-T09.rejected-update-no-false-history (G) — when the task-status updateDoc rejects, no separate false-successful history entry is claimed', async () => {
    await primeAuth()
    firestoreMock.setDocValue(`tasks/${TASK_ID}`, TASK_DOC_DATA)

    render(withProviders(
      <Routes><Route path="/tasks/:id" element={<TaskDetailPage />} /></Routes>,
      [`/tasks/${TASK_ID}`],
    ))

    await waitFor(() => expect(firestoreMock.liveCount(`tasks/${TASK_ID}/comments`)).toBe(1))
    firestoreMock.emitQuery(`tasks/${TASK_ID}/comments`, [])
    firestoreMock.emitQuery(`tasks/${TASK_ID}/attachments`, [])
    firestoreMock.emitQuery(`tasks/${TASK_ID}/history`, [])
    await waitFor(() => expect(firestoreMock.liveCount('tasks')).toBeGreaterThan(0))
    firestoreMock.emitQuery('tasks', [])

    await screen.findByText(TASKS.fin.title)

    const selects = screen.getAllByRole('combobox')
    const statusSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === 'בעבודה',
    ) as HTMLSelectElement

    // Queue the task updateDoc write to reject.
    firestoreMock.queueWriteResult(
      'updateDoc',
      'reject',
      new Error('permission-denied'),
      `tasks/${TASK_ID}`,
    )

    firestoreMock.writeCalls.length = 0
    await userEvent.setup().selectOptions(statusSelect, 'בוצע')

    // Requirement: a rejected update must not leave a false successful-
    // change history entry.
    await waitFor(() => {
      expect(screen.getByText('שגיאה בעדכון סטטוס')).toBeInTheDocument()
    })

    const hist = firestoreMock.writeCalls.find(
      (w) => w.kind === 'addDoc' && w.path === `tasks/${TASK_ID}/history`,
    )
    const upd = firestoreMock.writeCalls.find(
      (w) => w.kind === 'updateDoc' && w.path === `tasks/${TASK_ID}`,
    )
    expect(upd, 'task updateDoc was attempted').toBeTruthy()
    expect(
      hist,
      'no history entry may claim a successful change when the task update was rejected',
    ).toBeFalsy()
    expect(screen.queryByText('סטטוס עודכן')).not.toBeInTheDocument()
  })
})
