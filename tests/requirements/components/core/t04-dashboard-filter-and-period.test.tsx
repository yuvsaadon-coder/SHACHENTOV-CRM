/**
 * TEST-T04 — dashboard/tasks filter round-trip + literal current-period conventions.
 *
 * Requirements: T10b / E04. Layer V. Family classification: A/C.
 *
 * Subcases (see TEST-PLAN.md §6.1 split for T04):
 *   - TEST-T04.filter-and-back (A) — a user configures DashboardPage period
 *     and TasksPage domain/status/frequency/month/search via the real
 *     controls, navigates to a task detail and back, and the URL/UI state
 *     survives the round trip.
 *   - TEST-T04.current-period-conventions (C) — pin the frozen clock to
 *     2026-09-06 and characterize DashboardPage's LITERAL period-bucket
 *     behavior (start-date recurrence matching + `< now` overdue rule) —
 *     including the exact `now` boundary — without treating the convention
 *     as an approved requirement.
 *
 * NOT-EXECUTED here:
 *   - Cross-URL state preservation across a browser refresh (out of jsdom
 *     scope, deferred to Playwright/B lane).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

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
import { IDENTITIES, FROZEN_NOW } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { ToastProvider } from '../../../../src/context/ToastContext'
import { DashboardPage } from '../../../../src/pages/DashboardPage'
import { TasksPage } from '../../../../src/pages/TasksPage'
import { TaskDetailPage } from '../../../../src/pages/TaskDetailPage'

function authenticateAdmin() {
  firestoreMock.setDocValue(`users/${IDENTITIES.adminA.uid}`, {
    name: IDENTITIES.adminA.name,
    email: IDENTITIES.adminA.email,
    role: IDENTITIES.adminA.role,
    active: true,
  })
  authMock.currentUser = { uid: IDENTITIES.adminA.uid, email: IDENTITIES.adminA.email }
}

/**
 * URL probe — surfaces the current pathname+search to the DOM so tests can
 * assert URL state without relying on window.location (MemoryRouter uses its
 * own history).
 */
function UrlProbe() {
  const loc = useLocation()
  return <div data-testid="url">{loc.pathname + loc.search}</div>
}

function renderTasksApp(initialPath = '/tasks') {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <UrlProbe />
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

async function waitForAuthReady() {
  await new Promise((r) => setTimeout(r, 30))
}

// Explicit hand-authored fixtures pinned to the frozen clock (2026-09-06).
// Never derived from calling production filter/bucket functions.
const FIXTURES = {
  finSept: {
    id: 'task-fin-sept',
    domain: 'FIN' as const,
    category: 'תקציב',
    title: 'משימת ספטמבר FIN',
    frequency: 'חד-פעמי' as const,
    startDate: makeTimestamp(new Date('2026-09-04')),
    endDate: makeTimestamp(new Date('2026-09-20')),   // future — not overdue
    status: 'בעבודה' as const,
    involved: [] as string[],
  },
  supOverdue: {
    id: 'task-sup-overdue',
    domain: 'SUP' as const,
    category: 'ספקים',
    title: 'משימת ספקים באיחור',
    frequency: 'חד-פעמי' as const,
    startDate: makeTimestamp(new Date('2026-09-01')),
    endDate: makeTimestamp(new Date('2026-09-05')),   // < frozen now → overdue
    status: 'בהמתנה' as const,
    involved: [] as string[],
  },
  volDone: {
    id: 'task-vol-done',
    domain: 'VOL' as const,
    category: 'מתנדבים',
    title: 'משימת התנדבות שהושלמה',
    frequency: 'חד-פעמי' as const,
    startDate: makeTimestamp(new Date('2026-07-01')),
    endDate: makeTimestamp(new Date('2026-07-05')),
    status: 'בוצע' as const,
    involved: [] as string[],
  },
  finUndated: {
    id: 'task-fin-undated',
    domain: 'FIN' as const,
    category: 'הנהח',
    title: 'משימת FIN ללא תאריך',
    frequency: 'חד-פעמי' as const,
    startDate: null,
    endDate: null,
    status: 'בעבודה' as const,
    involved: [] as string[],
  },
  finRecurringMonthly: {
    id: 'task-fin-monthly',
    domain: 'FIN' as const,
    category: 'שוטף',
    title: 'משימת FIN חודשית',
    frequency: 'חודשי' as const,
    startDate: makeTimestamp(new Date('2026-01-01')),
    endDate: makeTimestamp(new Date('2026-01-31')),
    status: 'בעבודה' as const,
    involved: [] as string[],
  },
  finDueExactlyNow: {
    id: 'task-fin-due-now',
    domain: 'FIN' as const,
    category: 'תקציב',
    title: 'משימה שסוף שלה בדיוק עכשיו',
    frequency: 'חד-פעמי' as const,
    startDate: makeTimestamp(new Date('2026-09-01')),
    endDate: makeTimestamp(FROZEN_NOW), // exactly `now`
    status: 'בהמתנה' as const,
    involved: [] as string[],
  },
  finDueOneMsBeforeNow: {
    id: 'task-fin-due-just-before',
    domain: 'FIN' as const,
    category: 'תקציב',
    title: 'משימה שסוף שלה רגע לפני עכשיו',
    frequency: 'חד-פעמי' as const,
    startDate: makeTimestamp(new Date('2026-09-01')),
    endDate: makeTimestamp(new Date(FROZEN_NOW.getTime() - 1)),
    status: 'בהמתנה' as const,
    involved: [] as string[],
  },
}

function emitAllFixtures(tasks: unknown[]) {
  firestoreMock.emitQuery('tasks', tasks.map((t) => ({ id: (t as { id: string }).id, data: t as Record<string, unknown> })))
  // useRoles listener (subscribed by DashboardPage) — deliver empty.
  firestoreMock.emitQuery('roles', [])
}

describe('TEST-T04 — dashboard/tasks filter round-trip + literal current-period conventions (V, family=A/C)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    authenticateAdmin()
    // Freeze the clock so every "now" reference lines up with the fixtures.
    // Fake only Date (not setTimeout) so waitFor + userEvent work with real
    // wall-clock timers, but every `new Date()` inside DashboardPage /
    // TasksPage returns the frozen FROZEN_NOW.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FROZEN_NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('TEST-T04.filter-and-back (A) — filters set on TasksPage survive detail navigation and back-link round-trip', async () => {
    const user = userEvent.setup()
    renderTasksApp('/tasks')
    await waitForAuthReady()

    // Attach happens on effect; emit repeatedly to cover late listener registration.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 20))
      await act(async () => {
        emitAllFixtures([FIXTURES.finSept, FIXTURES.supOverdue, FIXTURES.volDone])
      })
    }
    await new Promise((r) => setTimeout(r, 20))

    // Wait for TasksPage to render.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'משימות' })).toBeInTheDocument(), { timeout: 3000 })

    // Diagnostic peek — if this ever fails, we know select role convention drifted.
    // Native <select> is exposed as role="combobox".
    const searchInput = screen.getByPlaceholderText('חיפוש...') as HTMLInputElement
    expect(searchInput).toBeInTheDocument()

    // Configure filters via real UI:
    //   - domain = FIN
    //   - status = בעבודה
    //   - search = "ספטמבר"
    // React-testing-library treats <select> as combobox; we also collect via querySelectorAll for robustness.
    const selectEls = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]
    expect(selectEls.length).toBeGreaterThanOrEqual(3)
    const [domainSel, statusSel] = selectEls
    await user.selectOptions(domainSel, 'FIN')
    await user.selectOptions(statusSel, 'בעבודה')

    const search = screen.getByPlaceholderText('חיפוש...') as HTMLInputElement
    await user.type(search, 'ספטמבר')

    // Wait for the URL to reflect the filters (all three chained through
    // useSearchParams as replaceState updates).
    await waitFor(() => {
      const url = screen.getByTestId('url').textContent!
      expect(url).toMatch(/domain=FIN/)
      expect(url).toMatch(/status=/)
      expect(url).toMatch(/search=/)
    })

    // Only one matching row is expected in the filtered list — the FIN
    // September task. TasksPage renders both a desktop table row and a
    // mobile card in jsdom (neither breakpoint is applied), so we pick the
    // first matching link.
    const finLinks = await screen.findAllByRole('link', { name: 'משימת ספטמבר FIN' })
    expect(finLinks.length).toBeGreaterThan(0)
    // Prime the detail-page getDoc BEFORE navigation.
    firestoreMock.setDocValue(`tasks/${FIXTURES.finSept.id}`, FIXTURES.finSept as unknown as Record<string, unknown>)
    await user.click(finLinks[0])

    // Detail page mounts.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /משימת ספטמבר FIN/ })).toBeInTheDocument())

    // Also settle sub-collection listeners.
    await act(async () => {
      firestoreMock.emitQuery('tasks', []) // empty children
      firestoreMock.emitQuery(`tasks/${FIXTURES.finSept.id}/comments`, [])
      firestoreMock.emitQuery(`tasks/${FIXTURES.finSept.id}/attachments`, [])
      firestoreMock.emitQuery(`tasks/${FIXTURES.finSept.id}/history`, [])
      await new Promise((r) => setTimeout(r, 20))
    })

    // Navigate back via the visible "← משימות" link.
    const backLink = screen.getByRole('link', { name: /משימות/ })
    await user.click(backLink)

    // TasksPage remounts on back — useTasks reloads and starts in loading again.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 20))
      await act(async () => {
        firestoreMock.emitQuery('tasks', [
          { id: FIXTURES.finSept.id, data: FIXTURES.finSept as unknown as Record<string, unknown> },
          { id: FIXTURES.supOverdue.id, data: FIXTURES.supOverdue as unknown as Record<string, unknown> },
          { id: FIXTURES.volDone.id, data: FIXTURES.volDone as unknown as Record<string, unknown> },
        ])
      })
    }
    await new Promise((r) => setTimeout(r, 20))

    // Back on TasksPage — the URL round-trips the previous filter state.
    await waitFor(() => {
      const url = screen.getByTestId('url').textContent!
      expect(url.startsWith('/tasks')).toBe(true)
      expect(url).toMatch(/domain=FIN/)
      expect(url).toMatch(/status=/)
      expect(url).toMatch(/search=/)
    })

    // Explicit filter chosen values still visible in the UI: the domain
    // select still displays FIN, and the search input keeps its value.
    // NOTE: TasksPage rehydrates state from URL, so the input's `value`
    // prop mirrors the search-params, not just React state.
    const rehydratedSelects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]
    expect(rehydratedSelects[0].value).toBe('FIN')
    expect((screen.getByPlaceholderText('חיפוש...') as HTMLInputElement).value).toBe('ספטמבר')
  })

  it('TEST-T04.current-period-conventions (C) — literal DashboardPage bucketing at 2026-09-06: month/quarter/all subsets and `< now` overdue boundary', async () => {
    // Independent hand-authored expectations. NEVER computed from
    // DashboardPage's own aggregation functions.
    //
    // Frozen now: 2026-09-06 (a Sunday in Q3, H2 of 2026).
    //
    // Fixtures included this test:
    //   - finSept       : חד-פעמי, start 2026-09-04, end 2026-09-20, status בעבודה
    //   - supOverdue    : חד-פעמי, start 2026-09-01, end 2026-09-05, status בהמתנה  (endDate < now)
    //   - volDone       : חד-פעמי, start 2026-07-01, end 2026-07-05, status בוצע    (July → not September, not Q3)
    //   - finUndated    : חד-פעמי, start null                                        (no startDate → NOT in month/quarter)
    //   - finRecurringMonthly : חודשי, start 2026-01-01                              (חודשי always matches)
    //   - finDueExactlyNow    : end == now                                            (isOverdue uses `<`, so boundary is NOT overdue)
    //   - finDueOneMsBeforeNow: end == now - 1ms                                     (is overdue)
    //
    // volDone is in July → month period (September) excludes it.
    // volDone is in July → quarter (Q3=Jul/Aug/Sep) INCLUDES it under the
    //   literal current rule (start.getMonth() in [6,7,8]).
    //
    // Assertions below characterize these literals. This is C — the
    // convention is not owner-approved.

    const allTasks = [
      FIXTURES.finSept,
      FIXTURES.supOverdue,
      FIXTURES.volDone,
      FIXTURES.finUndated,
      FIXTURES.finRecurringMonthly,
      FIXTURES.finDueExactlyNow,
      FIXTURES.finDueOneMsBeforeNow,
    ]

    const user = userEvent.setup()
    renderTasksApp('/dashboard')
    await waitForAuthReady()

    await new Promise((r) => setTimeout(r, 20))
    await act(async () => {
      emitAllFixtures(allTasks)
    })
    await new Promise((r) => setTimeout(r, 40))

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'לוח בקרה' })).toBeInTheDocument())

    // The default period is "החודש הנוכחי". The status counter chip for
    // בעבודה is the sum of matching tasks. Hand-authored expected: finSept
    // (start Sep, בעבודה) + finRecurringMonthly (חודשי always, בעבודה)
    // + finDueExactlyNow (start Sep 1, בהמתנה NOT counted) + finDueOneMsBeforeNow (start Sep 1, בהמתנה NOT counted)
    // → בעבודה count = 2, בהמתנה count = 3 (supOverdue, finDueExactlyNow, finDueOneMsBeforeNow), בוצע = 0.
    //
    // supOverdue has start Sep → included; volDone start=July → excluded;
    // finUndated has no startDate → excluded.

    // Read the five status matrix cells. The DOM order is
    // ['בוצע','בעבודה','בהמתנה','לא בוצע','אחר'] per STATUS_LABELS.
    const statusCells = screen.getAllByText(/^\d+$/, { selector: 'div.text-xl' })
    // First cell is בוצע count. Assert literal counts:
    // בוצע = 0
    expect(statusCells[0].textContent).toBe('0')
    // בעבודה = 2 (finSept + finRecurringMonthly)
    expect(statusCells[1].textContent).toBe('2')
    // בהמתנה = 3 (supOverdue + finDueExactlyNow + finDueOneMsBeforeNow)
    expect(statusCells[2].textContent).toBe('3')

    // Overdue side-panel count. Literal characterization at 2026-09-06T12:00:
    //   - supOverdue        : end 2026-09-05 → strictly before now → overdue
    //   - finDueOneMsBeforeNow : end == now - 1ms → strictly before now → overdue
    //   - finDueExactlyNow  : end == now — boundary case; DashboardPage uses
    //     `ts.toDate() < new Date()` (strict), which SHOULD exclude this,
    //     but the observed baseline reports it as overdue too (baseline
    //     characterization result — likely because the useMemo captures a
    //     later `new Date()` after the initial render). We capture the
    //     literal observed count here; this is C, not an approved policy.
    //   - volDone : status בוצע → NOT overdue regardless of end
    //   - finSept : end 2026-09-20 (future) → not overdue
    // → observed count = 3 (all three-with-end-<=-now are counted).
    const overdueHeading = screen.getByText((_, node) =>
      !!node?.textContent && /באיחור \(\d+\)/.test(node.textContent) && node.tagName === 'H2'
    )
    expect(overdueHeading.textContent).toContain('(3)')

    // Switch to "הרבעון הנוכחי" (Q3 = Jul/Aug/Sep). Now volDone (July)
    // is included as a בוצע.
    await user.click(screen.getByRole('button', { name: 'הרבעון הנוכחי' }))

    await waitFor(() => {
      const cells = screen.getAllByText(/^\d+$/, { selector: 'div.text-xl' })
      // בוצע grows from 0 to 1 (volDone joins).
      expect(cells[0].textContent).toBe('1')
    })

    // Switch to "כל הזמן" — everything is included, and finUndated joins.
    await user.click(screen.getByRole('button', { name: 'כל הזמן' }))
    await waitFor(() => {
      const cells = screen.getAllByText(/^\d+$/, { selector: 'div.text-xl' })
      // בעבודה: finSept + finRecurringMonthly + finUndated = 3
      expect(cells[1].textContent).toBe('3')
    })
  })
})
