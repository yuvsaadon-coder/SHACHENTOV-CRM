// Test-only Firebase Admin SDK binding for emulator/core tests, used ONLY
// to inspect real emulator state with genuine admin privilege (Storage
// object listing/reading) — never to fabricate or bypass what the actual
// production writer does. Admin reads/writes are not subject to
// firestore.rules/storage.rules, the same way `initializeTestEnvironment`'s
// `withSecurityRulesDisabled` isn't; this is the standard, real mechanism
// for privileged emulator inspection, not a workaround for a permission
// failure we can't otherwise explain.
import { initializeApp, deleteApp, getApps, type App } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { PROJECT_ID } from './emulator-env'

export function createEmulatorAdmin(appName: string) {
  const existing = getApps().find((a) => a.name === appName)
  const app: App = existing ?? initializeApp(
    { projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` },
    appName,
  )
  const bucket = getStorage(app).bucket()
  return {
    bucket,
    firestore: getFirestore(app),
    // A genuine custom token minted for an EXISTING real uid, so a second
    // independent client connection can sign in AS that exact same real
    // identity (e.g. to serve as an independently-authorized control
    // listener) — not a fabricated/cloned identity, the real Auth
    // Emulator issues and honors this token the same as it would in
    // production.
    createCustomToken: (uid: string) => getAuth(app).createCustomToken(uid),
    dispose: () => deleteApp(app),
  }
}
