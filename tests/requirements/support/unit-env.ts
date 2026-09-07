import { beforeEach } from 'vitest'
import { EMULATORS, PROJECT_ID } from './emulator-env'

function isolateEnvironment() {
  for (const key of [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'FIREBASE_TOKEN',
    'FIREBASE_SERVICE_ACCOUNT',
    'ANTHROPIC_API_KEY',
  ]) {
    delete process.env[key]
  }
  const values = {
    GCLOUD_PROJECT: PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: PROJECT_ID,
    FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT_ID }),
    FIREBASE_AUTH_EMULATOR_HOST: `${EMULATORS.auth.host}:${EMULATORS.auth.port}`,
    FIRESTORE_EMULATOR_HOST: `${EMULATORS.firestore.host}:${EMULATORS.firestore.port}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `${EMULATORS.storage.host}:${EMULATORS.storage.port}`,
    STORAGE_EMULATOR_HOST: `http://${EMULATORS.storage.host}:${EMULATORS.storage.port}`,
    VITE_FIREBASE_API_KEY: 'demo-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
    VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
    VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    VITE_FIREBASE_APP_ID: 'demo-app',
  }
  Object.assign(process.env, values)
  Object.assign(import.meta.env, values)
}

isolateEnvironment()
beforeEach(isolateEnvironment)
