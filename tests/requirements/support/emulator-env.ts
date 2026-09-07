export const PROJECT_ID = 'demo-shachentov-requirements'
export const EMULATORS = {
  auth: { host: '127.0.0.1', port: 9097 },
  firestore: { host: '127.0.0.1', port: 8787 },
  storage: { host: '127.0.0.1', port: 9297 },
} as const

export function assertEmulatorEnvironment() {
  if (process.env.GCLOUD_PROJECT !== PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT !== PROJECT_ID) {
    throw new Error(`Tests require the isolated project ${PROJECT_ID}`)
  }
  const config = JSON.parse(process.env.FIREBASE_CONFIG ?? '{}')
  if (config.projectId !== PROJECT_ID) {
    throw new Error('FIREBASE_CONFIG must identify the isolated demo project')
  }
  const variables = {
    FIREBASE_AUTH_EMULATOR_HOST: EMULATORS.auth,
    FIRESTORE_EMULATOR_HOST: EMULATORS.firestore,
    FIREBASE_STORAGE_EMULATOR_HOST: EMULATORS.storage,
  }
  for (const [name, address] of Object.entries(variables)) {
    if (process.env[name] !== `${address.host}:${address.port}`) {
      throw new Error(`${name} must point to the suite's loopback emulator`)
    }
  }
}
