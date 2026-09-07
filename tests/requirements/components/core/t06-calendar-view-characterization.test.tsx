/**
 * TEST-T06 — orphan CalendarView characterization + firm reachable-calendar
 * requirement through TasksPage.
 *
 * Requirements: T02 / T10a / E04 (tech spec L40 / executive summary L44:
 * a firm, reachable month/week/day calendar of tasks). Layer V.
 *
 * Retraction note: an earlier version of this file only characterized the
 * calendar's ABSENCE ("TasksPage.tsx lacks a calendar switch") as a `(C)`
 * case — that is a false-acceptance substitute for the firm, reachable
 * calendar requirement itself. TEST-PLAN.md's "supplementary C, not a
 * passing route test" language covers the orphan CalendarView
 * characterization only, not a substitute for testing reachability. This
 * file now asserts the firm requirement directly as `(G)` and keeps the
 * orphan-component characterization as supplementary evidence.
 *
 * Subcases:
 *   - TEST-T06.calendar-view-orphan-component-characterization (C) — mount the
 *     orphan CalendarView directly with a task-fin-like fixture (its `endDate`
 *     inside the shown month) and characterize what it currently renders:
 *     month header, the task's title in the list, the frequency-filter chip
 *     row, and the view-mode toggles ("קומפקטי" and "המשימות שלי").
 *   - TEST-T06.reachable-calendar-month-week-day (G) — the firm requirement:
 *     a user must be able to reach a month/week/day calendar of tasks
 *     through the real TasksPage. Asserted directly; expected red because
 *     no such reachable path exists in production (a missing feature, not
 *     missing test infrastructure).
 *
 * NOT-EXECUTED here (out of V-scope):
 *   - The full B/Playwright calendar interaction flow — deferred to the
 *     browser lane once a reachable calendar route/control exists.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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

import { firestoreMock, makeTimestamp } from '../../support/core-firestore-mock'
import { authMock } from '../../support/core-auth-mock'
import { IDENTITIES, TASKS, FROZEN_NOW } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { ToastProvider } from '../../../../src/context/ToastContext'
import { CalendarView } from '../../../../src/components/calendar/CalendarView'
import { TasksPage } from '../../../../src/pages/TasksPage'
import type { Task } from '../../../../src/types'

function authenticateAdmin() {
  firestoreMock.setDocValue(`users/${IDENTITIES.adminA.uid}`, {
    name: IDENTITIES.adminA.name,
    email: IDENTITIES.adminA.email,
    role: IDENTITIES.adminA.role,
    active: true,
  })
  authMock.currentUser = { uid: IDENTITIES.adminA.uid, email: IDENTITIES.adminA.email }
}

describe('TEST-T06 — orphan CalendarView characterization + reachable calendar requirement (V, family=C/G)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    authenticateAdmin()
    // Freeze Date only — CalendarView's initial year/month come from `new Date()`.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FROZEN_NOW)
  })

  it('TEST-T06.calendar-view-orphan-component-characterization (C) — mounting CalendarView in isolation renders the expected month header, filter chips, view toggles, and task title', async () => {
    // Task fixture whose endDate falls within the frozen month (September 2026).
    const task = {
      ...TASKS.fin,
      endDate: makeTimestamp(new Date('2026-09-15')),
    } as unknown as Task

    render(
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <CalendarView tasks={[task]} />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    )

    // Let AuthProvider resolve.
    await new Promise((r) => setTimeout(r, 30))

    // Month header — Hebrew month name for September (index 8).
    expect(screen.getByText(/ספטמבר\s+2026/)).toBeInTheDocument()

    // Task title renders inside the list.
    expect(screen.getByText(task.title)).toBeInTheDocument()

    // The frequency-filter chip row (label + one chip per FREQUENCY_LABELS).
    expect(screen.getByText('סינון תדירות:')).toBeInTheDocument()

    // View toggles: compact ("קומפקטי") and "המשימות שלי".
    expect(screen.getByRole('button', { name: /קומפקטי/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /המשימות שלי/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /כל המשימות/ })).toBeInTheDocument()

    // Task count reflects the single matching task.
    expect(screen.getByText(/^1 משימות$/)).toBeInTheDocument()
  })

  it('TEST-T06.reachable-calendar-month-week-day (G) — a user must be able to reach a month/week/day calendar of tasks through TasksPage', async () => {
    render(
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/tasks']}>
            <Routes>
              <Route path="/tasks" element={<TasksPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    )

    await new Promise((r) => setTimeout(r, 30))
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 20))
      await act(async () => {
        firestoreMock.emitQuery('tasks', [])
      })
    }
    await new Promise((r) => setTimeout(r, 20))

    // Firm requirement (tech L40 / exec L44): a calendar view of tasks with
    // month/week/day switching must be reachable from the real TasksPage.
    const calendarButton = screen.queryByRole('button', { name: /יומן|לוח שנה|calendar/i })
    expect(calendarButton).not.toBeNull()

    await userEvent.setup().click(calendarButton!)

    expect(screen.getByRole('button', { name: /חודש|month/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /שבוע|week/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^יום$|day/i })).toBeInTheDocument()
  })
})
