import {
  collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { decisionKey, type PeriodDecision } from '../lib/prices/history'
import type { RoundMeta } from '../lib/rounds/recommend'
import type { BranchSettings, VoteDoc, VotingConfig } from './model'
import { voteId } from './model'
import type { QuoteRecord, VotingStore } from './store'

const C = {
  config: 'voting_config', branches: 'voting_branches', votes: 'voting_votes', archive: 'voting_archivedVotes',
  quotes: 'voting_priceQuotes', decisions: 'voting_priceDecisions', rounds: 'voting_rounds',
} as const

export function createFirestoreStore(): VotingStore {
  const configRef = doc(db, C.config, 'main')
  return {
    mode: 'firestore',
    subscribeConfig(cb, onError) {
      return onSnapshot(configRef, (s) => cb(s.exists() ? (s.data() as Partial<VotingConfig>) : null), (e) => onError?.(e))
    },
    async updateConfigField(field, value) {
      await setDoc(configRef, { [field]: value }, { merge: true })
    },
    subscribeBranchSettings(cb, onError) {
      return onSnapshot(collection(db, C.branches), (snap) => {
        const out: Record<string, Partial<BranchSettings>> = {}
        snap.forEach((d) => { out[d.id] = d.data() as Partial<BranchSettings> })
        cb(out)
      }, (e) => onError?.(e))
    },
    async saveBranchSettings(branchId, s) {
      await setDoc(doc(db, C.branches, branchId), { ...s, updatedAt: serverTimestamp() }, { merge: true })
    },
    subscribeVotes(cb, onError) {
      return onSnapshot(collection(db, C.votes), (snap) => cb(snap.docs.map((d) => d.data() as VoteDoc)), (e) => onError?.(e))
    },
    subscribeMyVote(uid, branchId, cb, onError) {
      return onSnapshot(doc(db, C.votes, voteId(uid, branchId)), (s) => cb(s.exists() ? (s.data() as VoteDoc) : null), (e) => onError?.(e))
    },
    async submitVote(v) {
      await setDoc(doc(db, C.votes, voteId(v.uid, v.branchId)), { ...v, serverSubmittedAt: serverTimestamp() })
    },
    async archiveAllVotes(reason, roundNum) {
      const snap = await getDocs(collection(db, C.votes))
      const stamp = Date.now()
      const batch = writeBatch(db)
      snap.forEach((d) => {
        batch.set(doc(db, C.archive, `r${roundNum}_${d.id}_${stamp}`), { ...d.data(), round: roundNum, archivedReason: reason, archivedAt: serverTimestamp() })
        batch.delete(d.ref)
      })
      await batch.commit()
    },
    async loadArchivedVotes(round) {
      const snap = await getDocs(query(collection(db, C.archive), where('round', '==', round)))
      return snap.docs.map((d) => d.data() as VoteDoc)
    },
    async importArchivedVotes(votes, reason) {
      for (let i = 0; i < votes.length; i += 400) {
        const batch = writeBatch(db)
        for (const v of votes.slice(i, i + 400)) {
          batch.set(doc(db, C.archive, `legacy_r${v.round}_${voteId(v.uid, v.branchId)}_${v.submittedAt}`), { ...v, archivedReason: reason, archivedAt: serverTimestamp() })
        }
        await batch.commit()
      }
    },
    async saveQuoteRecord(rec) {
      await setDoc(doc(db, C.quotes, rec.id), { ...rec, serverCreatedAt: serverTimestamp() })
    },
    subscribeQuoteRecords(cb, onError) {
      const q = query(collection(db, C.quotes), orderBy('createdAt', 'desc'), limit(60))
      return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as QuoteRecord)), (e) => onError?.(e))
    },
    async saveSupplierChoice(periodId, category, supplierName, decidedAt) {
      await setDoc(doc(db, C.decisions, decisionKey(periodId, category)), { periodId, category, supplierName, decidedAt, serverDecidedAt: serverTimestamp() }, { merge: true })
    },
    async saveDiscount(periodId, category, discount) {
      await setDoc(doc(db, C.decisions, decisionKey(periodId, category)), { periodId, category, discount }, { merge: true })
    },
    subscribeDecisions(cb, onError) {
      return onSnapshot(collection(db, C.decisions), (snap) => {
        const out: Record<string, PeriodDecision> = {}
        snap.forEach((d) => { out[d.id] = d.data() as PeriodDecision })
        cb(out)
      }, (e) => onError?.(e))
    },
    async saveRoundMeta(meta) {
      await setDoc(doc(db, C.rounds, String(meta.num)), { ...meta }, { merge: true })
    },
    subscribeRoundMetas(cb, onError) {
      return onSnapshot(collection(db, C.rounds), (snap) => {
        const out: Record<number, RoundMeta> = {}
        snap.forEach((d) => { const m = d.data() as RoundMeta; out[m.num] = m })
        cb(out)
      }, (e) => onError?.(e))
    },
  }
}
