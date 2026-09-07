// TEST-T11 — Private/personal task isolation.
// Requirements: T10i / E12. Layer V. Family classification: A.
// Subcases:
//   - TEST-T11.private-task-crud-under-own-uid-path        (A) — every write
//     from PersonalTasksPage targets users/{uid}/personalTasks/... exclusively.
//   - TEST-T11.legacy-done-flag-displays-correctly         (A) — legacy
//     {done:true} without status renders as complete per PersonalTasksPage's
//     effectiveStatus fallback (PersonalTasksPage.tsx:15-18).
//   - TEST-T11.status-filter-transitions                   (A) — filter chips
//     narrow the visible list; changing status via the row select writes to
//     the correct doc path and updates counts.
//   - TEST-T11.delete-removes-only-own-record              (A) — deleteDoc
//     targets only the row's own path; other rows remain.
//   - TEST-T11.organizational-views-never-subscribe-to-personal-path (A) —
//     mounting TasksPage / KanbanView / GanttView with useTasks producing
//     only organizational docs results in ZERO onSnapshot listeners on any
//     personalTasks path.
//
// See TEST-PLAN.md §6.T row T11 and P05/P11/P27 baseline.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

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

import { firestoreMock, makeTimestamp as ts } from '../../support/core-firestore-mock'
import { authMock } from '../../support/core-auth-mock'
import { IDENTITIES, TASKS, docSnap } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { ToastProvider } from '../../../../src/context/ToastContext'
import { PersonalTasksPage } from '../../../../src/pages/PersonalTasksPage'
import { TasksPage } from '../../../../src/pages/TasksPage'
import { KanbanView } from '../../../../src/components/kanban/KanbanView'
import { GanttView } from '../../../../src/components/gantt/GanttView'

const HQ = { uid: IDENTITIES.hqFin.uid, email: IDENTITIES.hqFin.email }
const HQ_PROFILE = {
  name: IDENTITIES.hqFin.name,
  email: IDENTITIES.hqFin.email,
  role: 'admin',
  active: true,
}
const PERSONAL_PATH = `users/${HQ.uid}/personalTasks`

function withProviders(node: React.ReactNode) {
  return (
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

async function primeSignedIn() {
  firestoreMock.setDocValue(`users/${HQ.uid}`, HQ_PROFILE)
  authMock.currentUser = HQ
}

async function mountPersonalTasksReady(initialDocs: { id: string; data: Record<string, unknown> }[]) {
  await primeSignedIn()
  render(withProviders(<PersonalTasksPage />))
  await waitFor(() => expect(firestoreMock.liveCount(PERSONAL_PATH)).toBeGreaterThan(0))
  firestoreMock.emitQuery(PERSONAL_PATH, initialDocs)
}

beforeEach(() => {
  firestoreMock.reset()
  authMock.reset()
})

describe('TEST-T11 — private task isolation (V, family=A)', () => {
  it('TEST-T11.private-task-crud-under-own-uid-path (A) — add/edit/delete write ONLY to users/{uid}/personalTasks', async () => {
    await mountPersonalTasksReady([])

    await screen.findByText('משימות אישיות')

    const user = userEvent.setup()

    // Add
    firestoreMock.writeCalls.length = 0
    await user.type(screen.getByPlaceholderText('משימה חדשה...'), 'private hi')
    await user.click(screen.getByRole('button', { name: /הוסף/ }))

    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'addDoc' && w.path === PERSONAL_PATH,
      )).toBe(true)
    })
    // Every write recorded so far is under users/{uid}/personalTasks — not
    // the top-level `tasks` collection.
    for (const w of firestoreMock.writeCalls) {
      expect(w.path.startsWith(PERSONAL_PATH), `write to ${w.path} escaped personal namespace`).toBe(true)
      expect(w.path).not.toMatch(/^tasks\//)
      expect(w.path).not.toBe('tasks')
    }
  })

  it('TEST-T11.legacy-done-flag-displays-correctly (A) — a legacy {done:true} doc with no status field renders as complete (effectiveStatus fallback)', async () => {
    await mountPersonalTasksReady([
      {
        id: 'legacy-1',
        data: {
          title: 'legacy done task',
          notes: '',
          done: true,
          // NO status field — legacy shape
          recurring: false,
          dueDate: null,
          createdAt: ts(new Date('2026-08-01')),
          updatedAt: ts(new Date('2026-08-01')),
        },
      },
    ])

    // Because effectiveStatus returns 'בוצע' when done && !status
    // (PersonalTasksPage.tsx:15-18), the task lands in the "הושלמו" details
    // section — NOT in the open list. Assert it's inside the disclosure and
    // its select's value is 'בוצע'.
    const summary = await screen.findByText(/^הושלמו/) // "הושלמו (1)"
    expect(summary).toBeInTheDocument()
    // Open the disclosure so the item becomes visible in the DOM.
    const details = summary.closest('details') as HTMLDetailsElement
    details.open = true

    await screen.findByText('legacy done task')
    // The "done" section's select styled with STATUS_STYLE['בוצע']; its value
    // should be effectiveStatus = 'בוצע'.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const doneRowSelect = selects.find((s) => s.value === 'בוצע')
    expect(doneRowSelect, 'expected a select bound to value בוצע for the legacy task').toBeTruthy()
  })

  it('TEST-T11.status-filter-transitions (A) — filter chips narrow the visible list; changing status writes to own personal path', async () => {
    await mountPersonalTasksReady([
      {
        id: 'p-open',
        data: {
          title: 'open task',
          notes: '',
          done: false,
          status: 'לא בוצע',
          recurring: false,
          dueDate: null,
          createdAt: ts(new Date('2026-08-15')),
          updatedAt: ts(new Date('2026-08-15')),
        },
      },
      {
        id: 'p-in-progress',
        data: {
          title: 'in-progress task',
          notes: '',
          done: false,
          status: 'בעבודה',
          recurring: false,
          dueDate: null,
          createdAt: ts(new Date('2026-08-16')),
          updatedAt: ts(new Date('2026-08-16')),
        },
      },
    ])

    await screen.findByText('open task')
    await screen.findByText('in-progress task')

    const user = userEvent.setup()
    // Click the "בעבודה" filter chip.
    // Chip renders as a button carrying the label + count (e.g. "בעבודה (1)")
    const chip = screen.getAllByRole('button').find(
      (b) => (b.textContent ?? '').trim().startsWith('בעבודה'),
    )!
    await user.click(chip)

    await waitFor(() => {
      expect(screen.queryByText('open task')).not.toBeInTheDocument()
    })
    expect(screen.getByText('in-progress task')).toBeInTheDocument()

    // Transition in-progress → בוצע via the row's status select.
    firestoreMock.writeCalls.length = 0
    const rowSelect = (screen.getAllByRole('combobox') as HTMLSelectElement[]).find(
      (s) => s.value === 'בעבודה',
    )!
    await user.selectOptions(rowSelect, 'בוצע')

    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'updateDoc' && w.path === `${PERSONAL_PATH}/p-in-progress`,
      )).toBe(true)
    })
    // Payload has status='בוצע' and done=true (PersonalTasksPage.tsx:143-147).
    const upd = firestoreMock.writeCalls.find(
      (w) => w.kind === 'updateDoc' && w.path === `${PERSONAL_PATH}/p-in-progress`,
    )!
    expect((upd.data as { status: string }).status).toBe('בוצע')
    expect((upd.data as { done: boolean }).done).toBe(true)
  })

  it('TEST-T11.delete-removes-only-own-record (A) — deleteDoc targets the exact row path, other rows untouched', async () => {
    await mountPersonalTasksReady([
      {
        id: 'keep-me',
        data: {
          title: 'keep me task',
          notes: '',
          done: false,
          status: 'לא בוצע',
          recurring: false,
          dueDate: null,
          createdAt: ts(new Date('2026-08-16')),
          updatedAt: ts(new Date('2026-08-16')),
        },
      },
      {
        id: 'delete-me',
        data: {
          title: 'delete me task',
          notes: '',
          done: false,
          status: 'לא בוצע',
          recurring: false,
          dueDate: null,
          createdAt: ts(new Date('2026-08-15')),
          updatedAt: ts(new Date('2026-08-15')),
        },
      },
    ])

    await screen.findByText('delete me task')

    firestoreMock.writeCalls.length = 0

    // Delete button is the '✕' next to the row. There are two rows so two ✕'s;
    // the delete-me row's ✕ is the one adjacent to that row's title.
    const rowTitle = screen.getByText('delete me task')
    // The row wraps title + selects + delete button in a flex.items-center row.
    const row = rowTitle.closest('div.flex.items-center')!
    const deleteBtn = Array.from(row.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === '✕',
    )!
    await userEvent.setup().click(deleteBtn)

    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'deleteDoc' && w.path === `${PERSONAL_PATH}/delete-me`,
      )).toBe(true)
    })
    // No delete against the other row's path.
    expect(
      firestoreMock.writeCalls.find(
        (w) => w.kind === 'deleteDoc' && w.path === `${PERSONAL_PATH}/keep-me`,
      ),
    ).toBeFalsy()
    // No writes escaped the personal namespace.
    for (const w of firestoreMock.writeCalls) {
      expect(w.path.startsWith(PERSONAL_PATH)).toBe(true)
    }
  })

  it('TEST-T11.organizational-views-never-subscribe-to-personal-path (A) — TasksPage, KanbanView, GanttView subscribed via real useTasks never register an onSnapshot listener on any personalTasks path', async () => {
    // Organizational-only fixture: three org tasks, ZERO personal tasks.
    // We do NOT feed anything on any personalTasks path.
    await primeSignedIn()

    // Mount TasksPage: it will register a listener on `tasks` via useTasks.
    const { unmount: u1 } = render(withProviders(<TasksPage />))
    await waitFor(() => expect(firestoreMock.liveCount('tasks')).toBeGreaterThan(0))
    firestoreMock.emitQuery('tasks', [docSnap(TASKS.fin), docSnap(TASKS.done), docSnap(TASKS.overdue)])

    // Sanity: TasksPage rendered.
    await screen.findByRole('heading', { name: 'משימות' })

    // Assert: no listener anywhere with a path involving `personalTasks`.
    const personalListeners = firestoreMock.listeners.filter(
      (l) => l.live && l.path.includes('personalTasks'),
    )
    expect(
      personalListeners,
      `TasksPage must not subscribe to any personalTasks path; found: ${personalListeners.map((l) => l.path).join(', ')}`,
    ).toHaveLength(0)
    u1()

    // Mount KanbanView with the same org tasks — it's a pure component, no
    // useTasks call — but assert the same invariant for completeness.
    const { unmount: u2 } = render(
      withProviders(<KanbanView tasks={[TASKS.fin, TASKS.done, TASKS.overdue] as unknown as import('../../../../src/types').Task[]} />),
    )
    expect(
      firestoreMock.listeners.filter((l) => l.live && l.path.includes('personalTasks')),
    ).toHaveLength(0)
    u2()

    // Mount GanttView — also pure. Same invariant.
    const { unmount: u3 } = render(
      withProviders(
        <GanttView tasks={[TASKS.fin, TASKS.done, TASKS.overdue] as unknown as import('../../../../src/types').Task[]} />,
      ),
    )
    expect(
      firestoreMock.listeners.filter((l) => l.live && l.path.includes('personalTasks')),
    ).toHaveLength(0)
    u3()
  })
})
