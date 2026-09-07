import { getApps, initializeApp, deleteApp, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage as getAdminStorage } from 'firebase-admin/storage'
import { EMULATORS, PROJECT_ID } from './emulator-env'
import { fakeServiceAccountJson } from './knowledge-fake-service-account'

/**
 * Real emulator-backed Admin SDK helper for tests.
 *
 * IMPORTANT: this intentionally initializes the DEFAULT firebase-admin app
 * (no app name), not a separately named instance. Every handler under test
 * guards its own `initFirebase()` with `if (getApps().length > 0) return`,
 * which counts ANY registered app — named or default. If this helper used a
 * named app, that guard would see `getApps().length > 0`, skip creating the
 * default app entirely, and every `getFirestore()`/`getAuth()` call with no
 * app argument inside the handler would then throw "The default Firebase
 * app does not exist." Reusing the same default app the handlers themselves
 * would otherwise create keeps `initFirebase()`'s guard meaningful while
 * still letting tests seed/inspect fixtures through it directly.
 */
let testApp: App | null = null

export function adminApp(): App {
  if (!testApp) {
    const existing = getApps().find((a) => a.name === '[DEFAULT]')
    testApp = existing ?? initializeApp({
      credential: cert(JSON.parse(fakeServiceAccountJson())),
      projectId: PROJECT_ID,
    })
  }
  return testApp
}

export function adminDb(): Firestore {
  return getFirestore(adminApp())
}

export async function resetEmulatorApp(): Promise<void> {
  if (testApp) {
    await deleteApp(testApp)
    testApp = null
  }
}

/** Deletes every document under `emulator/firestore/projects/{project}/databases/(default)/documents`. */
export async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${EMULATORS.firestore.host}:${EMULATORS.firestore.port}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error(`Failed to clear Firestore emulator: ${res.status}`)
}

/** Deletes every Auth Emulator account for the isolated demo project. */
export async function clearAuthUsers(): Promise<void> {
  const res = await fetch(
    `http://${EMULATORS.auth.host}:${EMULATORS.auth.port}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error(`Failed to clear Auth emulator: ${res.status}`)
}

/**
 * Real, explicit cleanup of every object in the isolated demo project's
 * Storage Emulator bucket, using the standard Admin Storage `bucket.getFiles`
 * + per-object `file.delete()` (the real, supported GCS-compatible API the
 * emulator implements) — NOT the emulator's undocumented internal bulk-wipe
 * route, which returned 501 in this environment and is not a supported
 * contract to depend on. Every deletion is real; a genuinely failed delete
 * (anything other than the object already being gone) throws and fails the
 * calling test's cleanup step loudly, so isolation gaps are never silent.
 */
export async function clearStorage(): Promise<void> {
  const bucket = getAdminStorage(adminApp()).bucket(`${PROJECT_ID}.appspot.com`)
  const [files] = await bucket.getFiles()
  const results = await Promise.allSettled(files.map((file) => file.delete()))
  const realFailures = results.filter((r): r is PromiseRejectedResult => {
    if (r.status !== 'rejected') return false
    // A 404 here means another concurrent delete (or the object never truly
    // existed) already removed it — that is idempotent success, not a
    // cleanup failure, and is the ONLY error this function tolerates.
    const code = (r.reason as { code?: number })?.code
    return code !== 404
  })
  if (realFailures.length > 0) {
    throw new Error(
      `clearStorage: ${realFailures.length} object(s) failed to delete: ` +
      realFailures.map((r) => String((r as PromiseRejectedResult).reason)).join('; '),
    )
  }
}

/**
 * Signs in a real Auth Emulator account and returns a genuine Firebase ID
 * token, via the same custom-token mint + exchange path production
 * `portal-login.ts` performs, so tests exercise real token verification in
 * `chat.ts` / `hq-chat.ts` instead of a fabricated JWT.
 */
export async function exchangeCustomToken(customToken: string): Promise<{ idToken: string; localId: string }> {
  const res = await fetch(
    `http://${EMULATORS.auth.host}:${EMULATORS.auth.port}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  )
  if (!res.ok) {
    throw new Error(`Auth emulator signInWithCustomToken failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { idToken: string; localId: string }
  return data
}

export async function realIdTokenForUid(uid: string): Promise<string> {
  const customToken = await getAuth(adminApp()).createCustomToken(uid)
  const { idToken } = await exchangeCustomToken(customToken)
  return idToken
}
