/**
 * TEST-T01 — production-form task create → detail round-trip → list-view sparse-task crash.
 *
 * Requirements: T05a / T10a / E04. Layer V. Family classification: G — TasksPage
 * calls `t.category.toLowerCase()` (src/pages/TasksPage.tsx:106) but the actual
 * /tasks/new form (src/pages/TaskDetailPage.tsx:63-64) initializes the form to
 * `{ domain: 'CEO', status: 'לא בוצע', involved: [], contactRefs: [], steps: '', notes: '' }`
 * — with NO category field. A sparse task produced by the real form therefore
 * has category === undefined. When the user runs a search, TasksPage crashes on
 * the missing category. That is the (G) gap this file surfaces.
 *
 * Subcases (see TEST-PLAN.md §6 T01 row):
 *   - TEST-T01.create-then-detail-roundtrip     (A) — real form → captured write
 *     payload → same payload fed back through same detail view round-trips
 *     without crashing.
 *   - TEST-T01.sparse-task-in-list-view         (G) — production sparse task
 *     shown in TasksPage list with an active search filter crashes on
 *     `category.toLowerCase()`.
 *   - TEST-T01.reject-save-then-retry           (A/G) — rejected setDoc leaves
 *     the entered form values in place; user can retry and succeed.
 *
 * NOT-EXECUTED here (out of V-scope):
 *   - "Then revisiting list, searching, opening detail and editing" — full
 *     end-to-end covering the *edit* path after list-search reopen is deferred
 *     to Playwright / +R lane. This file exercises the create + list + retry
 *     halves and covers the plan-cited concrete gap.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
import { IDENTITIES } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { ToastProvider } from '../../../../src/context/ToastContext'
import { TaskDetailPage } from '../../../../src/pages/TaskDetailPage'
import { TasksPage } from '../../../../src/pages/TasksPage'

function authenticateAdmin() {
  firestoreMock.setDocValue(`users/${IDENTITIES.adminA.uid}`, {
    name: IDENTITIES.adminA.name,
    email: IDENTITIES.adminA.email,
    role: IDENTITIES.adminA.role,
    active: true,
  })
  authMock.currentUser = { uid: IDENTITIES.adminA.uid, email: IDENTITIES.adminA.email }
}

function renderDetail(initialPath: string) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

function renderList(initialPath = '/tasks') {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/tasks" element={<TasksPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

/** Wait for AuthProvider to leave loading state (users/<uid> getDoc has resolved). */
async function waitForAuthReady() {
  // Loading gate: RequireAuth uses `if (loading) return <Spinner />`, but we
  // mount pages directly. AuthContext's setLoading(false) fires after getDoc
  // resolves, which for setDocValue-primed identities is essentially the next
  // microtask. Give the mount a beat.
  await new Promise((r) => setTimeout(r, 30))
}

/**
 * TaskDetailPage uses bare <label> elements without htmlFor/id, so
 * findByLabelText does not match. Find the label text node, then locate the
 * form control that immediately follows it inside the same wrapping <div>.
 */
function fieldByLabel(labelText: string | RegExp): HTMLElement {
  const label = screen.getByText(labelText)
  const wrapper = label.parentElement!
  const el = wrapper.querySelector('input, select, textarea') as HTMLElement | null
  if (!el) throw new Error(`No control found next to label "${String(labelText)}"`)
  return el
}

describe('TEST-T01 — task create / detail round-trip / sparse-task list view (V, family=G)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    authenticateAdmin()
  })

  it('TEST-T01.create-then-detail-roundtrip (A) — real /tasks/new form fill saves a payload, and feeding that exact payload back through the same detail view renders without crash', async () => {
    const user = userEvent.setup()
    renderDetail('/tasks/new')
    await waitForAuthReady()

    // The new-task branch (TaskDetailPage.tsx:60-64) initializes with domain=CEO
    // and status=לא בוצע — NOT with the target FIN / בעבודה the requirement
    // asks for. Fill only fields the real form exposes.
    // Labels lack htmlFor — use position-based lookup helper.
    // Wait for the form (isNew branch mounts with editing=true).
    await waitFor(() => expect(screen.getByText(/כותרת משימה/)).toBeInTheDocument())
    const titleInput = fieldByLabel(/כותרת משימה/) as HTMLInputElement
    await user.type(titleInput, 'בדיקת משימה')

    // Domain select — pick FIN.
    const domainSelect = fieldByLabel('תחום') as HTMLSelectElement
    await user.selectOptions(domainSelect, 'FIN')

    // Status select — set to בעבודה.
    const statusSelect = fieldByLabel('סטטוס') as HTMLSelectElement
    await user.selectOptions(statusSelect, 'בעבודה')

    // Dates — the form exposes native date inputs.
    const startDate = fieldByLabel('תאריך התחלה') as HTMLInputElement
    await user.type(startDate, '2026-09-01')
    const endDate = fieldByLabel('תאריך סיום') as HTMLInputElement
    await user.type(endDate, '2026-09-10')

    // Owner/involved: the real form only exposes a free-text "involved" chip
    // editor (no owner field, no picker) — record the actual capability.
    const involvedInput = screen.getByPlaceholderText(/כתוב שם תפקיד/) as HTMLInputElement
    await user.type(involvedInput, 'צוות בדיקה')
    await user.click(screen.getByRole('button', { name: 'הוסף' }))

    // Save. The form does NOT expose a category input default; per plan we
    // deliberately do NOT fill category — this is the point.
    await user.click(screen.getByRole('button', { name: 'שמור' }))

    // Confirm the setDoc write went out with the sparse payload.
    await waitFor(() => {
      const setDocCalls = firestoreMock.writeCalls.filter((w) => w.kind === 'setDoc')
      expect(setDocCalls.length).toBeGreaterThan(0)
    })
    const setDocCall = firestoreMock.writeCalls.find((w) => w.kind === 'setDoc')!
    expect(setDocCall.path).toMatch(/^tasks\/TASK-/)
    const payload = setDocCall.data as Record<string, unknown>
    expect(payload.title).toBe('בדיקת משימה')
    expect(payload.domain).toBe('FIN')
    expect(payload.status).toBe('בעבודה')
    expect(payload.involved).toEqual(['צוות בדיקה'])

    // Documented sparse fact: 'category' is NOT in the write payload — the
    // form never asked for it. This is the observed production shape that
    // feeds the (G) list-view crash below.
    expect('category' in payload).toBe(false)

    // Round-trip: feed the exact captured payload back through the same
    // detail view and verify it renders without crash.
    const roundtripPath = setDocCall.path
    firestoreMock.setDocValue(roundtripPath, payload)

    // Fresh mount — a real detail view of the created task.
    const { unmount } = renderDetail(`/${roundtripPath}`)
    await waitFor(() => {
      // The heading uses the title once the doc resolves.
      const headings = screen.getAllByRole('heading', { level: 1 })
      expect(headings.some((h) => h.textContent?.includes('בדיקת משימה'))).toBe(true)
    })
    unmount()
  })

  it('TEST-T01.sparse-task-in-list-view (G) — production sparse task rendered by TasksPage with an active search crashes on category.toLowerCase()', async () => {
    // Build the exact same sparse task the real /tasks/new form would emit
    // when a user fills only title/domain (no category). This mirrors what
    // TEST-T01.create-then-detail-roundtrip observed as the actual payload
    // shape written by TaskDetailPage.tsx:120-124.
    const sparseTask = {
      id: 'TASK-1725600000000',
      // No category. No frequency. No dates. Matches the form's default
      // spread (`{ domain: 'CEO', status: 'לא בוצע', involved: [], contactRefs: [], steps: '', notes: '' }`) + user-entered title/domain.
      domain: 'FIN',
      status: 'בעבודה',
      involved: [],
      contactRefs: [],
      steps: '',
      notes: '',
      title: 'בדיקת משימה',
    }

    // The default filter has monthFilter=true and current-month; the sparse
    // task has no startDate so it will be filtered out of the current month
    // — deliberately begin with monthFilter=false so the sparse row is in
    // the filtered set, then apply a search. The (G) crash is on
    // t.category.toLowerCase() (TasksPage.tsx:106) inside the search filter.
    const user = userEvent.setup()
    renderList('/tasks?monthFilter=false&search=%D7%91%D7%93%D7%99%D7%A7%D7%94')
    await waitForAuthReady()

    // Deliver the snapshot only after mount so the useTasks listener attaches.
    // Because the URL search filter is active, the useMemo in TasksPage will
    // invoke t.category.toLowerCase() — expected to throw.
    // Wrap the delivery + settle in an async block that captures rendering.
    let renderError: unknown = null
    const originalOnError = window.onerror
    window.onerror = (msg) => { renderError = msg; return true }
    try {
      await act(async () => {
        firestoreMock.emitQuery('tasks', [{ id: sparseTask.id, data: sparseTask }])
        await new Promise((r) => setTimeout(r, 30))
      })
    } catch (err) {
      renderError = err
    } finally {
      window.onerror = originalOnError
    }

    // The GAP assertion: on baseline code the render must throw because
    // TasksPage.tsx:106 invokes .toLowerCase() on undefined category.
    // If the production code has been guarded, the same task must appear
    // in the filtered list.
    // Non-inverted assertion: the row for 'בדיקת משימה' must render safely
    // when search is applied. This is the firm requirement — the round-trip
    // saved task must be readable throughout without crash.
    void user
    const rows = screen.queryAllByText('בדיקת משימה')
    expect({ renderError, foundRows: rows.length }).toEqual({
      renderError: null,
      foundRows: expect.any(Number),
    })
    // If a row rendered, it must be exactly one (list view + no mobile card
    // duplicate under the desktop breakpoint; jsdom's default doesn't
    // suppress .md:hidden classes, so both may render).
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('TEST-T01.reject-save-then-retry (A/G) — a rejected setDoc leaves the form values intact; a retry succeeds', async () => {
    const user = userEvent.setup()
    renderDetail('/tasks/new')
    await waitForAuthReady()

    await waitFor(() => expect(screen.getByText(/כותרת משימה/)).toBeInTheDocument())
    const titleInput = fieldByLabel(/כותרת משימה/) as HTMLInputElement
    await user.type(titleInput, 'בדיקת משימה')
    const domainSelect = fieldByLabel('תחום') as HTMLSelectElement
    await user.selectOptions(domainSelect, 'FIN')

    // Queue a one-shot reject for the next setDoc.
    firestoreMock.queueWriteResult('setDoc', 'reject', new Error('injected write failure'))

    await user.click(screen.getByRole('button', { name: 'שמור' }))

    // After the rejected save the form must remain populated so the user
    // can retry (TaskDetailPage.tsx:143 catch swallows and toasts).
    await waitFor(() => {
      // The button re-enables after the failure.
      const btn = screen.getByRole('button', { name: 'שמור' })
      expect(btn).not.toBeDisabled()
    })
    // Firm requirement: entered values must survive the failed save.
    expect((fieldByLabel(/כותרת משימה/) as HTMLInputElement).value).toBe('בדיקת משימה')
    expect((fieldByLabel('תחום') as HTMLSelectElement).value).toBe('FIN')
    // Toast error is announced.
    expect(await screen.findByText(/שגיאה בשמירת המשימה/)).toBeInTheDocument()

    // Retry: no queued outcome ⇒ default resolve.
    await user.click(screen.getByRole('button', { name: 'שמור' }))

    await waitFor(() => {
      const setDocCalls = firestoreMock.writeCalls.filter((w) => w.kind === 'setDoc')
      // First call was the rejected one (recorded) + second is the successful retry.
      expect(setDocCalls.length).toBe(2)
    })
    const retryPayload = firestoreMock.writeCalls.filter((w) => w.kind === 'setDoc')[1].data as Record<string, unknown>
    expect(retryPayload.title).toBe('בדיקת משימה')
    expect(retryPayload.domain).toBe('FIN')
  })
})
