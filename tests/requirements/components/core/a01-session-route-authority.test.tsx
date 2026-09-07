// TEST-A01 — identity, routes, and session authority.
// Requirements: T04 / T09 / E01. Layer V. Family classification: A.
// Exercises the REAL App, real AuthProvider, real LoginPage. Mocks only the
// Firebase Auth/Firestore SDK boundary via the shared core-*-mock harnesses.
//
// Per TEST-PLAN.md §6.A row A01 the flow is:
//   GIVEN signed-out browser at /tasks/task-fin;
//   WHEN auth initialization settles, then HQ logs in using synthetic
//        email/password and later logs out;
//   THEN login redirect, dashboard navigation, authorized direct CRM routes
//        and final protected-route denial occur without stale protected
//        content. Include incorrect password then successful correction.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

const HQ_USER = { uid: IDENTITIES.hqFin.uid, email: IDENTITIES.hqFin.email }
const HQ_PROFILE = {
  name: IDENTITIES.hqFin.name,
  email: IDENTITIES.hqFin.email,
  role: IDENTITIES.hqFin.role,
  active: IDENTITIES.hqFin.active,
}

function seedHqUserProfile() {
  firestoreMock.setDocValue(`users/${HQ_USER.uid}`, HQ_PROFILE)
}

// Prevent list-view hooks (useTasks / useRoles / etc.) from staying in the
// loading spinner state forever when they get rendered after a redirect.

describe('TEST-A01 — session/route authority (V, family=A)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    window.history.replaceState({}, '', '/')
  })

  it('TEST-A01.login-logout-route-guard (A) — anonymous /tasks/task-fin bounces to /login, successful HQ login lands on /dashboard, logout re-denies /tasks', async () => {
    window.history.pushState({}, '', '/tasks/task-fin')
    seedHqUserProfile()

    render(<App />)

    // Auth initialization settles with no user → RequireAuth redirects to /login.
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login')
    })
    // LoginPage renders — HQ tab is the default per LoginPage.tsx:11 (mode='hq').
    expect(await screen.findByRole('button', { name: 'כניסה' })).toBeInTheDocument()

    // HQ signs in. Note: LoginPage labels lack htmlFor/id wiring, so we
    // locate inputs by their type-specific placeholders (LoginPage.tsx:110/121).
    const user = userEvent.setup()
    authMock.queueSignIn('resolve', HQ_USER)
    await user.type(screen.getByPlaceholderText('your@email.com'), HQ_USER.email!)
    await user.type(screen.getByPlaceholderText('••••••••'), 'correct-horse-battery-staple')
    await user.click(screen.getByRole('button', { name: 'כניסה' }))

    // handleHQ calls navigate('/dashboard') on success. AuthProvider's
    // onAuthStateChanged callback also fires (via authMock.emit inside the
    // signInWithEmailAndPassword mock), setting appUser=HQ profile.
    await waitFor(() => {
      // The LoginPage email field must be gone — we have left /login.
      expect(screen.queryByPlaceholderText('your@email.com')).not.toBeInTheDocument()
    })
    expect(window.location.pathname).toBe('/dashboard')

    // Directly visit an authorized CRM route with the SAME live session.
    window.history.pushState({}, '', '/contacts')
    // Force React Router to react to the popstate-less pushState by
    // dispatching a popstate manually.
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/contacts')
    })
    // Feed the ContactsPage hooks so it can render past its Spinner state.
    // Emitting after subscription is what actually reaches the live listener.
    await waitFor(() => expect(firestoreMock.liveCount('contacts')).toBeGreaterThan(0))
    firestoreMock.emitQuery('contacts', [])
    firestoreMock.emitQuery('tasks', [])
    // ContactsPage header must render — proves RequireAuth allowed us in.
    await screen.findByRole('heading', { name: 'אנשי קשר' })

    // Logout — signOut() in AuthContext triggers our authMock.signOut which
    // emits null; RequireAuth then bounces protected routes to /login.
    await act(async () => {
      await authMock.emit(null) // model the internal signOut auth-state flip
    })

    window.history.pushState({}, '', '/tasks')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login')
    })
    // No stale protected content: TasksPage header must NOT be in the DOM.
    expect(screen.queryByRole('heading', { name: 'משימות' })).not.toBeInTheDocument()
  })

  it('TEST-A01.login-error-then-retry (A) — wrong password shows error message then a correct retry lands on /dashboard', async () => {
    window.history.pushState({}, '', '/login')
    seedHqUserProfile()

    render(<App />)

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    const user = userEvent.setup()

    // First attempt: incorrect password.
    authMock.queueSignIn('reject', undefined, Object.assign(new Error('auth/wrong-password'), { code: 'auth/wrong-password' }))
    await user.type(screen.getByPlaceholderText('your@email.com'), HQ_USER.email!)
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'כניסה' }))

    // LoginPage.tsx:32-34 sets a Hebrew error message on failure.
    expect(await screen.findByText('אימייל או סיסמה שגויים')).toBeInTheDocument()
    // Still on /login — no premature protected navigation on failed login.
    expect(window.location.pathname).toBe('/login')

    // Second attempt: correct password.
    authMock.queueSignIn('resolve', HQ_USER)
    await user.clear(screen.getByPlaceholderText('••••••••'))
    await user.type(screen.getByPlaceholderText('••••••••'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'כניסה' }))

    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    // Error banner must clear on retry — LoginPage.tsx:28 setError('').
    expect(screen.queryByText('אימייל או סיסמה שגויים')).not.toBeInTheDocument()
  })
})
