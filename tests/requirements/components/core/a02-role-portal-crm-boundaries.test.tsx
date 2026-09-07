// TEST-A02 — role/portal-vs-CRM boundaries.
// Requirements: T04 / T09 / T11 / E02. Layer V. Family classification: A.
// Real App, real AuthProvider, real RequireAuth/RequireCoordinator/SmartRedirect.
//
// Per TEST-PLAN.md §6.A row A02 the flow is:
//   GIVEN coord-a and HQ identities;
//   WHEN each directly visits CRM and portal routes, plus /, /portal,
//        /portal/login, unknown path;
//   THEN coordinator cannot render CRM and HQ cannot render coordinator
//        screens; login alias and default destinations match P01.
//
// This asserts CLIENT ROUTE ROUTING only, not data authorization — the plan
// (P27) is explicit that route guards are not a security boundary.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

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
import App from '../../../../src/App'

const HQ = { uid: IDENTITIES.hqFin.uid, email: IDENTITIES.hqFin.email }
const COORD = { uid: IDENTITIES.coordA.uid, email: IDENTITIES.coordA.email }

function primeHqSignedIn() {
  firestoreMock.setDocValue(`users/${HQ.uid}`, {
    name: IDENTITIES.hqFin.name,
    email: IDENTITIES.hqFin.email,
    role: IDENTITIES.hqFin.role,
    active: true,
  })
  authMock.currentUser = HQ
}

function primeCoordSignedIn() {
  firestoreMock.setDocValue(`users/${COORD.uid}`, {
    name: IDENTITIES.coordA.name,
    email: IDENTITIES.coordA.email,
    role: 'coordinator',
    active: true,
    branchId: IDENTITIES.coordA.branchId,
  })
  authMock.currentUser = COORD
}

async function feedEmptySnapshot(path: string, timeoutMs = 2000) {
  const start = Date.now()
  while (firestoreMock.liveCount(path) === 0) {
    if (Date.now() - start > timeoutMs) return
    await new Promise((r) => setTimeout(r, 5))
  }
  firestoreMock.emitQuery(path, [])
}

describe('TEST-A02 — role/portal-vs-CRM boundaries (V, family=A)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    window.history.replaceState({}, '', '/')
  })

  it('TEST-A02.coord-cannot-render-crm (A) — coord-a directly visiting /tasks is redirected out of CRM by RequireAuth', async () => {
    primeCoordSignedIn()
    window.history.pushState({}, '', '/tasks')

    render(<App />)

    // RequireAuth (App.tsx:33) redirects role==='coordinator' to /portal/home.
    await waitFor(() => expect(window.location.pathname).toBe('/portal/home'))
    // Explicit absence of a CRM-only heading: TasksPage header must not exist.
    expect(screen.queryByRole('heading', { name: 'משימות' })).not.toBeInTheDocument()
    // Feed useBranch subscription so CoordinatorPortal exits its loading spinner.
    // useBranch queries the branches collection scoped to coord uid.
    await feedEmptySnapshot('branches')
    // With no branches, CoordinatorPortal renders its "no branches" fallback.
    await screen.findByText('אין סניפים מוגדרים למשתמש זה.')
  })

  it('TEST-A02.hq-cannot-render-portal (A) — hq-fin directly visiting /portal/home is redirected to /dashboard by RequireCoordinator', async () => {
    primeHqSignedIn()
    window.history.pushState({}, '', '/portal/home')

    render(<App />)

    // RequireCoordinator (App.tsx:41) redirects non-coord authenticated user
    // to /dashboard.
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    // The coordinator portal nav labels must not be visible.
    expect(screen.queryByText('דיווח')).not.toBeInTheDocument()
  })

  it('TEST-A02.portal-login-alias-to-login (A) — /portal/login always redirects to /login, even when signed out', async () => {
    window.history.pushState({}, '', '/portal/login')

    render(<App />)

    // App.tsx:59 aliases /portal/login to /login as an unconditional Navigate.
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    // The LoginPage HQ tab button proves the login page rendered.
    expect(await screen.findByRole('button', { name: 'כניסת מטה' })).toBeInTheDocument()
  })

  it('TEST-A02.root-redirect-hq (A) — signed-in hq-fin at "/" lands on /dashboard', async () => {
    primeHqSignedIn()
    window.history.pushState({}, '', '/')

    render(<App />)

    // Root inside RequireAuth (App.tsx:87) navigates to /dashboard for non-coord.
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
  })

  it('TEST-A02.root-redirect-coord (A) — signed-in coord-a at "/" lands on /portal/home', async () => {
    primeCoordSignedIn()
    window.history.pushState({}, '', '/')

    render(<App />)

    // Root inside RequireAuth (App.tsx:33) redirects coords to /portal/home.
    await waitFor(() => expect(window.location.pathname).toBe('/portal/home'))
  })

  it('TEST-A02.unknown-path-smartredirect-hq (A) — hq-fin at unknown path lands on /dashboard via SmartRedirect', async () => {
    primeHqSignedIn()
    window.history.pushState({}, '', '/does-not-exist')

    render(<App />)

    // Wildcard route uses SmartRedirect (App.tsx:44/105); HQ → /dashboard.
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
  })

  it('TEST-A02.unknown-path-smartredirect-coord (A) — coord-a at unknown path lands on /portal/home via SmartRedirect', async () => {
    primeCoordSignedIn()
    window.history.pushState({}, '', '/nonsense/deep/path')

    render(<App />)

    // Wildcard SmartRedirect (App.tsx:47) sends coords to /portal/home.
    await waitFor(() => expect(window.location.pathname).toBe('/portal/home'))
  })

  it('TEST-A02.unknown-path-anonymous-goes-to-login (A) — signed-out unknown path is not treated as authenticated', async () => {
    window.history.pushState({}, '', '/some/deep/nonsense')

    render(<App />)

    // Anonymous: SmartRedirect resolves to /dashboard (its default branch),
    // which is behind RequireAuth, which then redirects to /login. The final
    // observable pathname must be /login — the user must NEVER be shown CRM.
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(await screen.findByRole('button', { name: 'כניסת מטה' })).toBeInTheDocument()
  })

  it('TEST-A02.portal-index-defaults-to-portal-home (A) — coord-a at /portal lands on /portal/home', async () => {
    primeCoordSignedIn()
    window.history.pushState({}, '', '/portal')

    render(<App />)

    // CoordinatorPortal short-circuits into a "no branches" fallback when
    // useBranch returns []; seed a single branch so the Outlet actually
    // renders and the index Navigate fires (CoordinatorPortal.tsx:82).
    const start = Date.now()
    while (firestoreMock.liveCount('branches') === 0) {
      if (Date.now() - start > 2000) break
      await new Promise((r) => setTimeout(r, 5))
    }
    firestoreMock.emitQuery('branches', [
      { id: 'branch-a', data: { name: 'סניף בדיקה א', type: 'food', city: 'ירושלים', coordinatorUids: ['coord-a'] } },
    ])

    // App.tsx:71 defines <Route index element={<Navigate to="/portal/home" />}>.
    await waitFor(() => expect(window.location.pathname).toBe('/portal/home'))
  })
})
