import { PROJECT_ID } from './emulator-env'

/**
 * `tests/requirements/vitest.rules.config.ts` (the emulator lane) uses
 * `support/emulator-setup.ts` as its setupFile, NOT `support/unit-env.ts` —
 * so none of `VITE_FIREBASE_API_KEY`/`VITE_FIREBASE_AUTH_DOMAIN`/etc are
 * ever set for this lane. `src/lib/firebase.ts` reads those
 * `import.meta.env.VITE_FIREBASE_*` values exactly once, at module-load
 * time, to build its `initializeApp(firebaseConfig)` call — with them
 * missing, the resulting app has an empty/invalid API key, and any real
 * Auth Emulator REST call (e.g. `signInWithCustomToken`) fails with
 * `auth/invalid-api-key` before ever reaching the emulator.
 *
 * This module has NO other imports and does nothing but set those values as
 * a side effect of being imported, so it MUST be the first import listed in
 * any test file that (directly or transitively, e.g. via a hook or
 * `AuthContext`) imports `src/lib/firebase.ts` — ES module import
 * declarations execute in the order they're written for sibling imports,
 * and a module with no imports of its own runs to completion before the
 * next import statement's module graph is even loaded.
 */
const values = {
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: 'demo-app',
}
Object.assign(import.meta.env, values)
