// Shared Firebase Auth SDK boundary mock for components/core tests (layer V).
//
// Fakes the auth-state transport only: onAuthStateChanged callback delivery,
// and controllable outcomes for signIn/signOut/signInWithCustomToken. Never
// fakes token verification or authorization decisions — those are real-SDK
// facts asserted in the emulator/core lane.
//
//   vi.mock('firebase/auth', async (importOriginal) => {
//     const actual = await importOriginal<typeof import('firebase/auth')>()
//     const { buildAuthMock } = await import('../../support/core-auth-mock')
//     return buildAuthMock(actual)
//   })

import { vi } from 'vitest'

export type FakeFirebaseUser = { uid: string; email?: string | null }

type AuthListener = (user: FakeFirebaseUser | null) => void

class AuthMockController {
  listeners: AuthListener[] = []
  currentUser: FakeFirebaseUser | null = null
  pendingSignInResult: { result: 'resolve' | 'reject'; user?: FakeFirebaseUser; error?: Error } | null = null
  pendingCustomTokenResult: { result: 'resolve' | 'reject'; user?: FakeFirebaseUser; error?: Error } | null = null
  signOutCalls = 0

  reset() {
    this.listeners = []
    this.currentUser = null
    this.pendingSignInResult = null
    this.pendingCustomTokenResult = null
    this.signOutCalls = 0
  }

  /** Deliver an auth-state change to every subscriber, in subscription order. */
  emit(user: FakeFirebaseUser | null) {
    this.currentUser = user
    for (const l of this.listeners) l(user)
  }

  queueSignIn(result: 'resolve' | 'reject', user?: FakeFirebaseUser, error?: Error) {
    this.pendingSignInResult = { result, user, error }
  }

  queueCustomTokenSignIn(result: 'resolve' | 'reject', user?: FakeFirebaseUser, error?: Error) {
    this.pendingCustomTokenResult = { result, user, error }
  }
}

export const authMock = new AuthMockController()

export function buildAuthMock(actual: Record<string, unknown>) {
  const onAuthStateChanged = vi.fn((_auth: unknown, callback: AuthListener) => {
    authMock.listeners.push(callback)
    // Real Firebase Auth always fires once, asynchronously, with the current state.
    queueMicrotask(() => callback(authMock.currentUser))
    return () => {
      authMock.listeners = authMock.listeners.filter((l) => l !== callback)
    }
  })

  const signInWithEmailAndPassword = vi.fn(async (_auth: unknown, _email: string, _password: string) => {
    const outcome = authMock.pendingSignInResult
    authMock.pendingSignInResult = null
    if (!outcome || outcome.result === 'resolve') {
      const user = outcome?.user ?? { uid: 'signed-in-user' }
      authMock.emit(user)
      return { user }
    }
    throw outcome.error ?? Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), { code: 'auth/invalid-credential' })
  })

  const signInWithCustomToken = vi.fn(async (_auth: unknown, _token: string) => {
    const outcome = authMock.pendingCustomTokenResult
    authMock.pendingCustomTokenResult = null
    if (!outcome || outcome.result === 'resolve') {
      const user = outcome?.user ?? { uid: 'coord-a' }
      authMock.emit(user)
      return { user }
    }
    throw outcome.error ?? Object.assign(new Error('Firebase: Error (auth/invalid-custom-token).'), { code: 'auth/invalid-custom-token' })
  })

  const signOut = vi.fn(async (_auth: unknown) => {
    authMock.signOutCalls += 1
    authMock.emit(null)
  })

  return {
    ...actual,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithCustomToken,
    signOut,
  }
}
