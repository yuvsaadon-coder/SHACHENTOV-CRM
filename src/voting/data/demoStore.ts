import { decisionKey, type PeriodDecision } from '../lib/prices/history'
import type { RoundMeta } from '../lib/rounds/recommend'
import type { BranchSettings, VoteDoc, VotingConfig } from './model'
import { voteId } from './model'
import type { QuoteRecord, VotingStore } from './store'

const K = (k: string) => `voting-demo-${k}`

/** Browser-only store for previews and end-to-end tests. Same semantics as the Firestore store. */
export function createDemoStore(ls: Storage): VotingStore {
  const read = <T,>(k: string, fallback: T): T => { try { const r = ls.getItem(K(k)); return r ? (JSON.parse(r) as T) : fallback } catch { return fallback } }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const write = (k: string, v: unknown) => { ls.setItem(K(k), JSON.stringify(v)); emit() }
  if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key?.startsWith('voting-demo-')) emit() })
  const sub = (fn: () => void) => { listeners.add(fn); queueMicrotask(fn); return () => { listeners.delete(fn) } }
  const votes = () => read<Record<string, VoteDoc>>('votes', {})

  return {
    mode: 'demo',
    subscribeConfig: (cb) => sub(() => cb(read<Partial<VotingConfig> | null>('config', null))),
    async updateConfigField(field, value) { write('config', { ...read<Partial<VotingConfig>>('config', {}), [field]: value }) },
    subscribeBranchSettings: (cb) => sub(() => cb(read<Record<string, Partial<BranchSettings>>>('branches', {}))),
    async saveBranchSettings(id, s) { write('branches', { ...read<Record<string, BranchSettings>>('branches', {}), [id]: s }) },
    subscribeVotes: (cb) => sub(() => cb(Object.values(votes()))),
    subscribeMyVote: (uid, branchId, cb) => sub(() => cb(votes()[voteId(uid, branchId)] ?? null)),
    async submitVote(v) { write('votes', { ...votes(), [voteId(v.uid, v.branchId)]: v }) },
    async archiveAllVotes(reason, roundNum) {
      const archive = read<unknown[]>('archive', [])
      for (const v of Object.values(votes())) archive.push({ ...v, round: roundNum, archivedReason: reason, archivedAt: Date.now() })
      ls.setItem(K('archive'), JSON.stringify(archive))
      write('votes', {})
    },
    async loadArchivedVotes(round) { return read<(VoteDoc & { round?: number })[]>('archive', []).filter((v) => v.round === round) },
    async saveQuoteRecord(rec) { write('quotes', [rec, ...read<QuoteRecord[]>('quotes', [])].slice(0, 60)) },
    subscribeQuoteRecords: (cb) => sub(() => cb(read<QuoteRecord[]>('quotes', []))),
    async saveSupplierChoice(periodId, category, supplierName, decidedAt) {
      const all = read<Record<string, PeriodDecision>>('decisions', {}); const k = decisionKey(periodId, category)
      write('decisions', { ...all, [k]: { ...all[k], periodId, category, supplierName, decidedAt } })
    },
    async saveDiscount(periodId, category, discount) {
      const all = read<Record<string, PeriodDecision>>('decisions', {}); const k = decisionKey(periodId, category)
      write('decisions', { ...all, [k]: { ...(all[k] ?? { periodId, category, supplierName: '', decidedAt: 0 }), discount } })
    },
    subscribeDecisions: (cb) => sub(() => cb(read<Record<string, PeriodDecision>>('decisions', {}))),
    async saveRoundMeta(meta) { const all = read<Record<number, RoundMeta>>('rounds', {}); write('rounds', { ...all, [meta.num]: { ...all[meta.num], ...meta } }) },
    subscribeRoundMetas: (cb) => sub(() => cb(read<Record<number, RoundMeta>>('rounds', {}))),
  }
}
