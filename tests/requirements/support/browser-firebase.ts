import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, getIdToken } from 'firebase/auth'
import { connectFirestoreEmulator, disableNetwork, enableNetwork, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { EMULATORS, PROJECT_ID } from './emulator-env'

const app = initializeApp({
  apiKey: 'requirements-browser-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  messagingSenderId: '1',
  appId: 'requirements-browser-app',
})

export const auth = getAuth(app)
connectAuthEmulator(auth, `http://${EMULATORS.auth.host}:${EMULATORS.auth.port}`, { disableWarnings: true })

export const db = getFirestore(app)
connectFirestoreEmulator(db, EMULATORS.firestore.host, EMULATORS.firestore.port)

export const storage = getStorage(app)
connectStorageEmulator(storage, EMULATORS.storage.host, EMULATORS.storage.port)

if (typeof window !== 'undefined') {
  Object.assign(window, {
    __requirementsGetCurrentIdToken: () => {
      if (!auth.currentUser) throw new Error('No current Firebase user')
      return getIdToken(auth.currentUser)
    },
    __requirementsDisableFirestoreNetwork: () => disableNetwork(db),
    __requirementsEnableFirestoreNetwork: () => enableNetwork(db),
  })
}
