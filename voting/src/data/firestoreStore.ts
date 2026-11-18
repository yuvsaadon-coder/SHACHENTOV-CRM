import { initializeApp } from 'firebase/app'
import {
  collection, connectFirestoreEmulator, doc, getDocs, initializeFirestore, onSnapshot, serverTimestamp, setDoc,
  writeBatch,
} from 'firebase/firestore'
import type { LegacyConfig, LegacyVote } from './legacy'
import type { ConfigField, ConfigValue, Store } from './store'

export function createFirestoreStore(): Store {
  const env = import.meta.env
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true })
  if (env.VITE_FIREBASE_EMULATORS === 'true') connectFirestoreEmulator(db, '127.0.0.1', 8080)

  const configRef = doc(db, 'config', 'main')
  const votesCol = collection(db, 'votes')

  return {
    mode: 'firestore',
    subscribeConfig(cb, onError) {
      return onSnapshot(configRef, (s) => cb(s.exists() ? (s.data() as Partial<LegacyConfig>) : null), (e) => onError?.(e))
    },
    async updateConfigField<F extends ConfigField>(field: F, value: ConfigValue<F>) {
      // merge:true touches only this field and creates the document if it does not exist yet.
      await setDoc(configRef, { [field]: value }, { merge: true })
    },
    subscribeVotes(cb, onError) {
      return onSnapshot(votesCol, (snap) => {
        const v: Record<string, LegacyVote> = {}
        snap.forEach((d) => { v[d.id] = d.data() as LegacyVote })
        cb(v)
      }, (e) => onError?.(e))
    },
    async submitVote(vote) {
      await setDoc(doc(votesCol, vote.coordinatorId), { ...vote, serverSubmittedAt: serverTimestamp() })
    },
    async archiveAllVotes(reason, roundNum) {
      const snap = await getDocs(votesCol)
      const stamp = Date.now()
      const batch = writeBatch(db)
      snap.forEach((d) => {
        batch.set(doc(db, 'archivedVotes', `r${roundNum}_${d.id}_${stamp}`), {
          ...d.data(), coordinatorId: d.id, round: roundNum, archivedReason: reason, archivedAt: serverTimestamp(),
        })
        batch.delete(d.ref)
      })
      await batch.commit()
    },
  }
}
