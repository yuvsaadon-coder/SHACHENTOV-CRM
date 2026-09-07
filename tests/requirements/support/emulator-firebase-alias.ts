// Test-only alias for `src/lib/firebase.ts`, used ONLY by emulator/core
// tests via `vi.mock('../../../../src/lib/firebase', ...)` so that real,
// unmodified production hooks/components (which import `{ auth, db,
// storage }` from that module) transparently get real Firebase SDK
// instances connected to the loopback emulators instead of a live
// project. No production file is edited — this substitutes only the
// test's own module resolution.
//
// Each call creates a uniquely-named Firebase app so parallel/serial test
// files never collide on the default app registered by another import.
import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from './emulator-env'

export function createEmulatorFirebaseAlias(appName: string): {
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
  dispose: () => Promise<void>
} {
  assertEmulatorEnvironment()

  const existing = getApps().find((a) => a.name === appName)
  const app: FirebaseApp = existing ?? initializeApp(
    {
      projectId: PROJECT_ID,
      apiKey: 'demo-api-key',
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      storageBucket: `${PROJECT_ID}.appspot.com`,
    },
    appName,
  )

  const auth = getAuth(app)
  const db = getFirestore(app)
  const storage = getStorage(app)

  connectAuthEmulator(auth, `http://${EMULATORS.auth.host}:${EMULATORS.auth.port}`, { disableWarnings: true })
  connectFirestoreEmulator(db, EMULATORS.firestore.host, EMULATORS.firestore.port)
  connectStorageEmulator(storage, EMULATORS.storage.host, EMULATORS.storage.port)

  return {
    auth,
    db,
    storage,
    dispose: () => deleteApp(app),
  }
}
