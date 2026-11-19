import { initializeApp } from 'firebase/app'
import {
  collection, connectFirestoreEmulator, doc, getDocs, initializeFirestore, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore'
import type { LegacyConfig, LegacyVote } from './legacy'
import type { ConfigField, ConfigValue, QuoteRecord, Store } from './store'
import { decisionKey, type PeriodDecision } from '../lib/prices/history'
import type { RoundMeta } from '../lib/rounds/recommend'

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
    async saveQuoteRecord(rec) {
      await setDoc(doc(db, 'priceQuotes', rec.id), { ...rec, serverCreatedAt: serverTimestamp() })
    },
    subscribeQuoteRecords(cb, onError) {
      const q = query(collection(db, 'priceQuotes'), orderBy('createdAt', 'desc'), limit(30))
      return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as QuoteRecord)), (e) => onError?.(e))
    },
    async saveSupplierChoice(periodId, category, supplierName, decidedAt) {
      await setDoc(doc(db, 'priceDecisions', decisionKey(periodId, category)), { periodId, category, supplierName, decidedAt, serverDecidedAt: serverTimestamp() }, { merge: true })
    },
    async saveDiscount(periodId, category, discount) {
      await setDoc(doc(db, 'priceDecisions', decisionKey(periodId, category)), { periodId, category, discount }, { merge: true })
    },
    async saveRoundMeta(meta) {
      await setDoc(doc(db, 'rounds', String(meta.num)), { ...meta }, { merge: true })
    },
    subscribeRoundMetas(cb, onError) {
      return onSnapshot(collection(db, 'rounds'), (snap) => {
        const out: Record<number, RoundMeta> = {}
        snap.forEach((d) => { const m = d.data() as RoundMeta; out[m.num] = m })
        cb(out)
      }, (e) => onError?.(e))
    },
    async loadArchivedVotes(round) {
      const snap = await getDocs(query(collection(db, 'archivedVotes'), where('round', '==', round)))
      return snap.docs.map((d) => d.data() as LegacyVote)
    },
    subscribeDecisions(cb, onError) {
      return onSnapshot(collection(db, 'priceDecisions'), (snap) => {
        const out: Record<string, PeriodDecision> = {}
        snap.forEach((d) => { out[d.id] = d.data() as PeriodDecision })
        cb(out)
      }, (e) => onError?.(e))
    },
  }
}
