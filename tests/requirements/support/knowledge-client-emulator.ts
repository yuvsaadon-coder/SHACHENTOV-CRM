import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { connectStorageEmulator } from 'firebase/storage'
import { auth, db, storage } from '../../../src/lib/firebase'
import { EMULATORS } from './emulator-env'

let connected = false

function swallowAlreadyConnected(error: unknown) {
  if (error instanceof Error && /already connected|already exists|has already been called/i.test(error.message)) {
    return
  }
  throw error
}

export function connectClientEmulators() {
  if (connected) return

  try {
    connectFirestoreEmulator(db, EMULATORS.firestore.host, EMULATORS.firestore.port)
  } catch (error) {
    swallowAlreadyConnected(error)
  }

  try {
    connectAuthEmulator(
      auth,
      `http://${EMULATORS.auth.host}:${EMULATORS.auth.port}`,
      { disableWarnings: true },
    )
  } catch (error) {
    swallowAlreadyConnected(error)
  }

  try {
    connectStorageEmulator(storage, EMULATORS.storage.host, EMULATORS.storage.port)
  } catch (error) {
    swallowAlreadyConnected(error)
  }

  connected = true
}
