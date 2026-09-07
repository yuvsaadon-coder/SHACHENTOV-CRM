import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb, adminApp } from './knowledge-admin'

/** Canonical fixture identities shared across F/H contract & emulator tests. */
export const FIXTURE = {
  coordA: { uid: 'coord-a', name: 'רכזת סניף א', phone: '050-111-2222' },
  coordB: { uid: 'coord-b', name: 'רכז סניף ב', phone: '050-333-4444' },
  hq: { uid: 'hq-fin', name: 'עובד מטה פיננסים', domain: 'FIN' as const },
  admin: { uid: 'admin-1', name: 'מנהלת מערכת' },
  branchA: { id: 'branch-a', name: 'סניף א', city: 'ירושלים' },
  branchB: { id: 'branch-b', name: 'סניף ב', city: 'תל אביב' },
}

/** Ensures a real Auth Emulator account exists for the given uid (idempotent, race-safe). */
export async function ensureAuthUser(uid: string, email?: string): Promise<void> {
  const auth = getAuth(adminApp())
  try {
    await auth.getUser(uid)
    return
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error
  }
  try {
    await auth.createUser({ uid, email: email ?? `${uid}@demo-suite.test` })
  } catch (e: unknown) {
    // Another concurrently-running fixture call (a sibling test file sharing
    // this same emulator instance) may have created this uid between our
    // getUser() miss and this createUser() call. That is not a real failure
    // for an idempotent "ensure" helper — only rethrow genuinely unexpected
    // errors.
    const code = (e as { errorInfo?: { code?: string } } | undefined)?.errorInfo?.code
    if (code !== 'auth/uid-already-exists') throw e
  }
}

/** Seeds one coordinator user + branch that authorizes them, and returns the real ID token. */
export async function seedCoordinator(opts: {
  uid: string
  name: string
  phone: string
  branchId: string
  branchName: string
}): Promise<void> {
  const db = adminDb()
  await ensureAuthUser(opts.uid)
  await db.collection('users').doc(opts.uid).set({
    name: opts.name,
    phone: opts.phone,
    role: 'coordinator',
    branchId: opts.branchId,
    active: true,
  })
  await db.collection('branches').doc(opts.branchId).set({
    name: opts.branchName,
    type: 'food',
    city: 'ירושלים',
    coordinatorUids: FieldValue.arrayUnion(opts.uid),
  }, { merge: true })
}

export async function seedHqUser(opts: { uid: string; name: string; role: string; active?: boolean }): Promise<void> {
  const db = adminDb()
  await ensureAuthUser(opts.uid)
  await db.collection('users').doc(opts.uid).set({
    name: opts.name,
    role: opts.role,
    active: opts.active ?? true,
  })
}
