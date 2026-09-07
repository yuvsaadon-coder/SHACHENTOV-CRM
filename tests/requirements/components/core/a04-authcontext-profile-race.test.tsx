// TEST-A04 — AuthContext profile-resolution race.
// Requirements: T04 / T15a. Layer V. Family classification: G — code predicts
// gaps (see TEST-PLAN.md P02).
// Exercises the REAL AuthProvider/useAuth callback wiring — not a stubbed
// useAuth hook. Race timing is controlled through the shared firestoreMock
// gate/releaseGetDoc API so the deferred getDoc(users/<uid>) can resolve at
// any point relative to the auth-state transitions.
//
// Per TEST-PLAN.md §6.A row A04 the flow is:
//   GIVEN an authenticated A profile resolution is deferred;
//   WHEN B signs in or logout occurs before A resolves, then A's promise
//        resolves last;
//   THEN B/logout never displays A's profile or authority.
//   Also transition A → profile-missing and reject B's profile read.
//
// Root of the gap: AuthContext.tsx:22-40 awaits getDoc(users/<uid>) INSIDE
// the onAuthStateChanged callback. If a later auth event arrives before the
// earlier getDoc resolves, the later completion overwrites the later state,
// or (in the missing-profile branch) leaves the earlier stale appUser intact
// because `if (snap.exists()) setAppUser(...)` never clears on absence.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../../../src/context/AuthContext'

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

const A = { uid: 'A-uid', email: 'a@example.test' }
const B = { uid: 'B-uid', email: 'b@example.test' }

const A_PROFILE = { name: 'Profile A', email: A.email, role: 'FIN', active: true }
const B_PROFILE = { name: 'Profile B', email: B.email, role: 'VOL', active: true }

// Small probe component that exposes AuthContext state to the DOM. It
// deliberately doesn't render anything else — the AuthProvider callbacks
// are the unit under test.
function Probe() {
  const { firebaseUser, appUser, loading } = useAuth()
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="firebaseUid">{firebaseUser?.uid ?? 'null'}</div>
      <div data-testid="appUid">{appUser?.uid ?? 'null'}</div>
      <div data-testid="appName">{appUser?.name ?? 'null'}</div>
      <div data-testid="appRole">{appUser?.role ?? 'null'}</div>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  )
}

describe('TEST-A04 — AuthContext profile-resolution race (V, family=G)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
  })

  it('TEST-A04.late-a-resolves-after-b-signin (G) — when A profile getDoc resolves after B has signed in, appUser must reflect B (not A)', async () => {
    // Gate BOTH getDocs so we can control the exact resolution order.
    firestoreMock.gate(`users/${A.uid}`)
    firestoreMock.gate(`users/${B.uid}`)

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('true'))

    // Auth callback for A. AuthProvider awaits getDoc(users/A-uid) — gated.
    await act(async () => {
      authMock.emit(A)
    })
    await waitFor(() => expect(screen.getByTestId('firebaseUid').textContent).toBe(A.uid))

    // Before A's getDoc resolves, B signs in.
    await act(async () => {
      authMock.emit(B)
    })
    await waitFor(() => expect(screen.getByTestId('firebaseUid').textContent).toBe(B.uid))

    // Release B first — B's appUser is set.
    await act(async () => {
      firestoreMock.releaseGetDoc(`users/${B.uid}`, B_PROFILE)
    })
    await waitFor(() => expect(screen.getByTestId('appUid').textContent).toBe(B.uid))

    // NOW release A last. Requirement: A's late completion must NOT overwrite
    // the current B-identified session. Any UI reading useAuth() must see B.
    await act(async () => {
      firestoreMock.releaseGetDoc(`users/${A.uid}`, A_PROFILE)
    })
    // Give React a beat to flush.
    await new Promise((r) => setTimeout(r, 20))

    // Firm requirement (T15a): appUser must match the CURRENT firebaseUser.
    // Production gap (AuthContext.tsx:29-31 unconditionally setAppUser from
    // the resolving callback's captured `user`) makes this fail red.
    expect(screen.getByTestId('firebaseUid').textContent).toBe(B.uid)
    expect(screen.getByTestId('appUid').textContent).toBe(B.uid)
    expect(screen.getByTestId('appRole').textContent).toBe(B_PROFILE.role)
    expect(screen.getByTestId('appName').textContent).toBe(B_PROFILE.name)
  })

  it('TEST-A04.late-a-resolves-after-logout (G) — a logout that races before A resolves must not leave A displayed as the current profile', async () => {
    firestoreMock.gate(`users/${A.uid}`)

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('true'))

    await act(async () => {
      authMock.emit(A)
    })
    await waitFor(() => expect(screen.getByTestId('firebaseUid').textContent).toBe(A.uid))

    // Logout arrives before A's profile read completes.
    await act(async () => {
      authMock.emit(null)
    })
    await waitFor(() => expect(screen.getByTestId('firebaseUid').textContent).toBe('null'))
    // Signed-out branch synchronously clears appUser to null.
    expect(screen.getByTestId('appUid').textContent).toBe('null')

    // A's promise finally resolves. Requirement: it must NOT resurrect A's
    // profile onto a signed-out session.
    await act(async () => {
      firestoreMock.releaseGetDoc(`users/${A.uid}`, A_PROFILE)
    })
    await new Promise((r) => setTimeout(r, 20))

    expect(screen.getByTestId('firebaseUid').textContent).toBe('null')
    // Production gap: setAppUser fires here anyway because firebaseUser is
    // captured in the closure — appUid will read A.uid, failing red.
    expect(screen.getByTestId('appUid').textContent).toBe('null')
  })

  it('TEST-A04.a-transition-to-profile-missing (G) — after A is authenticated, transitioning to a Firebase user whose profile document does not exist must clear appUser', async () => {
    // Prime A's profile then let A sign in cleanly.
    firestoreMock.setDocValue(`users/${A.uid}`, A_PROFILE)
    renderProvider()
    await act(async () => {
      authMock.emit(A)
    })
    await waitFor(() => expect(screen.getByTestId('appUid').textContent).toBe(A.uid))
    expect(screen.getByTestId('appRole').textContent).toBe(A_PROFILE.role)

    // Now transition to a different Firebase user whose users/<uid> is
    // absent (getDoc → snap.exists()===false). Firm requirement: the app
    // must NOT continue to display A's authority.
    const C = { uid: 'C-uid', email: 'c@example.test' }
    // Do NOT setDocValue(`users/C-uid`) → getDoc resolves undefined data.
    await act(async () => {
      authMock.emit(C)
    })
    await new Promise((r) => setTimeout(r, 20))

    expect(screen.getByTestId('firebaseUid').textContent).toBe(C.uid)
    // Production gap: AuthContext.tsx:29 guards `if (snap.exists()) setAppUser`
    // and never clears the previous profile when the new one is missing — so
    // appUid stays at A. This is the red assertion we leave in place.
    expect(screen.getByTestId('appUid').textContent).toBe('null')
    expect(screen.getByTestId('appRole').textContent).toBe('null')
  })

  it('TEST-A04.b-profile-read-rejected (G) — when B is authenticated but B\'s profile read is rejected (permission-denied), A\'s previously loaded profile must not remain in effect', async () => {
    // A signs in cleanly.
    firestoreMock.setDocValue(`users/${A.uid}`, A_PROFILE)
    renderProvider()
    await act(async () => {
      authMock.emit(A)
    })
    await waitFor(() => expect(screen.getByTestId('appUid').textContent).toBe(A.uid))

    // B's profile read must reject with a permission-denied-style error.
    // Simulated via the shared mock's gate/rejectGetDoc API (added for this
    // case): gate the path, emit B, then reject the outstanding getDoc call.
    firestoreMock.gate(`users/${B.uid}`)
    await act(async () => {
      authMock.emit(B)
    })
    await waitFor(() => expect(screen.getByTestId('firebaseUid').textContent).toBe(B.uid))

    await act(async () => {
      firestoreMock.rejectGetDoc(`users/${B.uid}`, Object.assign(new Error('permission-denied'), { code: 'permission-denied' }))
    })
    await new Promise((r) => setTimeout(r, 20))

    expect(screen.getByTestId('firebaseUid').textContent).toBe(B.uid)
    // Production gap: AuthContext.tsx's catch{} around getDoc swallows the
    // rejection and never clears appUser, so A's profile survives B's
    // rejected read. Red-expected assertion asserting the T15a requirement.
    expect(screen.getByTestId('appUid').textContent).toBe('null')
  })
})
