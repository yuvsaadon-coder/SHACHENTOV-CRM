/**
 * TEST-A08 — coordinator login form (component/V layer).
 *
 * Concrete subcases (see TEST-PLAN.md §6.1 "Other mixed families and required splits" row A08):
 *   - TEST-A08.normalized-login (C) — characterize CURRENT request LoginPage sends
 *     for a matching name/phone with whitespace + phone punctuation. Real handleCoordinator
 *     only .trim()s both fields and posts them literally to `/.netlify/functions/portal-login`
 *     (see src/pages/LoginPage.tsx lines 44-53). No punctuation stripping is performed.
 *   - TEST-A08.recoverable-signin-error (A) — a non-ok fetch response yields a visible
 *     recoverable error (not a crash / silent no-op) and a subsequent corrected submission
 *     succeeds and reaches the portal.
 *
 * Out of scope for the component lane: any real Auth-Emulator-backed exact-UID assertion.
 * signInWithCustomToken outcome is fed by authMock.queueCustomTokenSignIn.
 * Fetch is fully stubbed via vi.stubGlobal because network.ts blocks non-loopback
 * origins and jsdom cannot serve `/.netlify/functions/portal-login` — this is
 * explicitly permitted for isolated request-formation assertions (TEST-PLAN.md §4 F).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const { buildFirestoreMock } = await import('../../support/core-firestore-mock')
  const base = buildFirestoreMock(actual) as Record<string, unknown>
  // KnowledgeAdminPage & HierarchySetupPage import getDocs; real getDocs would
  // hit the network and be blocked by the loopback guard. Return an empty
  // snapshot instead so any page under App can render without unhandled rejection.
  base.getDocs = vi.fn(async () => ({
    docs: [] as unknown[], size: 0, empty: true, forEach: () => {},
  }))
  return base
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

describe('TEST-A08 coordinator login form (real LoginPage, component/V layer)', () => {
  let fetchStub: ReturnType<typeof vi.fn>

  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    window.history.pushState({}, '', '/login')
    fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('TEST-A08.normalized-login (C): submits literally trimmed-but-unnormalized name and phone, signs in with returned custom token, then navigates to /portal/home', async () => {
    // Prepare the `users/coord-a` doc so RequireCoordinator lets the portal mount.
    firestoreMock.setDocValue(`users/${IDENTITIES.coordA.uid}`, {
      name: IDENTITIES.coordA.name,
      email: IDENTITIES.coordA.email,
      role: 'coordinator',
      active: true,
    })

    // Sequence exactly one fetch response for the login POST.
    fetchStub.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'synthetic-custom-token-A08' }),
    } as Response)
    authMock.queueCustomTokenSignIn('resolve', { uid: IDENTITIES.coordA.uid, email: IDENTITIES.coordA.email })

    render(<App />)

    // Real LoginPage should be visible (unauthenticated).
    await screen.findByText('כניסת מטה')
    await userEvent.click(screen.getByText('כניסת רכזים'))

    // Fields with intentional surrounding whitespace + phone punctuation.
    // Baseline LoginPage.handleCoordinator does .trim() on both, no further normalization.
    // LoginPage's <label>s have no htmlFor, so identify inputs by placeholder.
    const nameInput = screen.getByPlaceholderText('למשל: שירה גולדברג')
    const phoneInput = screen.getByPlaceholderText('052-0000000')
    await userEvent.type(nameInput, '  רכז סניף א  ')
    await userEvent.type(phoneInput, ' 052-000-0001 ')

    await userEvent.click(screen.getByRole('button', { name: /כניסה לפורטל|מתחבר/ }))

    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1))
    // Characterize the CURRENT request exactly as LoginPage constructs it.
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/.netlify/functions/portal-login')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    const body = JSON.parse(String(init.body))
    // .trim() is applied (leading/trailing spaces removed) but punctuation kept as-is.
    expect(body).toEqual({ name: 'רכז סניף א', phone: '052-000-0001' })

    // Then signInWithCustomToken is called with returned token, then navigate('/portal/home', {replace}).
    await waitFor(() => expect(window.location.pathname).toBe('/portal/home'))
  })

  it('TEST-A08.recoverable-signin-error (A): non-ok fetch response yields a visible error and does not silently succeed; corrected resubmission then navigates', async () => {
    firestoreMock.setDocValue(`users/${IDENTITIES.coordA.uid}`, {
      name: IDENTITIES.coordA.name,
      email: IDENTITIES.coordA.email,
      role: 'coordinator',
      active: true,
    })

    // First: server rejects the login; second: success.
    fetchStub
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'שם או טלפון שגויים' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'synthetic-custom-token-A08-retry' }),
      } as Response)
    authMock.queueCustomTokenSignIn('resolve', { uid: IDENTITIES.coordA.uid, email: IDENTITIES.coordA.email })

    render(<App />)
    await screen.findByText('כניסת מטה')
    await userEvent.click(screen.getByText('כניסת רכזים'))

    await userEvent.type(screen.getByPlaceholderText('למשל: שירה גולדברג'), 'שם שגוי')
    await userEvent.type(screen.getByPlaceholderText('052-0000000'), '0500000000')
    await userEvent.click(screen.getByRole('button', { name: /כניסה לפורטל|מתחבר/ }))

    // Error surface appears (recoverable, not a crash / silent no-op).
    await screen.findByText('שם או טלפון שגויים')
    // Still on /login — no premature navigation.
    expect(window.location.pathname).toBe('/login')

    // Correct the inputs and resubmit.
    await userEvent.clear(screen.getByPlaceholderText('למשל: שירה גולדברג'))
    await userEvent.clear(screen.getByPlaceholderText('052-0000000'))
    await userEvent.type(screen.getByPlaceholderText('למשל: שירה גולדברג'), IDENTITIES.coordA.name)
    await userEvent.type(screen.getByPlaceholderText('052-0000000'), '0500000001')
    await userEvent.click(screen.getByRole('button', { name: /כניסה לפורטל|מתחבר/ }))

    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(window.location.pathname).toBe('/portal/home'))
  })
})

