// Voting storage on the CRM's Firestore (collections prefixed voting_). A browser-only demo implementation with the
// same behaviour is used for local previews and end-to-end tests (VITE_VOTING_DEMO=true).
import type { Discount, PeriodDecision } from '../lib/prices/history'
import type { RoundMeta } from '../lib/rounds/recommend'
import type { BranchSettings, RoundState, VoteDoc, VotingConfig } from './model'

/** History entry for a saved supplier quote (files themselves are not stored). */
export interface QuoteRecord {
  id: string
  createdAt: number
  supplierId: string
  supplierName: string
  fileNames: string[]
  method: 'ai' | 'local'
  vatMode: string
  updated: number
  added: number
  changes: { productId: string; name: string; action: 'update' | 'add'; oldPrice: number | null; newPrice: number }[]
  periodId?: string
  offers?: { key: string; name: string; productId: string | null; price: number; emoji?: string; cat?: 'dry' | 'fresh' }[]
}

export type ConfigField = 'products' | 'baskets' | 'round'
export type ConfigValue<F extends ConfigField> = F extends 'round' ? RoundState : VotingConfig[Exclude<F, 'round'>]
type Unsub = () => void
type OnErr = (e: Error) => void

export interface VotingStore {
  mode: 'firestore' | 'demo'
  subscribeConfig(cb: (cfg: Partial<VotingConfig> | null) => void, onError?: OnErr): Unsub
  /** Writes ONE field of voting_config/main, never the whole document. */
  updateConfigField<F extends ConfigField>(field: F, value: ConfigValue<F>): Promise<void>
  subscribeBranchSettings(cb: (s: Record<string, Partial<BranchSettings>>) => void, onError?: OnErr): Unsub
  saveBranchSettings(branchId: string, s: BranchSettings): Promise<void>
  /** All votes of the current round (HQ only). */
  subscribeVotes(cb: (v: VoteDoc[]) => void, onError?: OnErr): Unsub
  /** One coordinator's vote for one branch. */
  subscribeMyVote(uid: string, branchId: string, cb: (v: VoteDoc | null) => void, onError?: OnErr): Unsub
  submitVote(v: VoteDoc): Promise<void>
  /** Moves every vote to voting_archivedVotes with a reason, then removes it (never just delete). */
  archiveAllVotes(reason: string, roundNum: number): Promise<void>
  loadArchivedVotes(round: number): Promise<VoteDoc[]>
  saveQuoteRecord(rec: QuoteRecord): Promise<void>
  subscribeQuoteRecords(cb: (recs: QuoteRecord[]) => void, onError?: OnErr): Unsub
  saveSupplierChoice(periodId: string, category: string, supplierName: string, decidedAt: number): Promise<void>
  saveDiscount(periodId: string, category: string, discount: Discount | null): Promise<void>
  subscribeDecisions(cb: (d: Record<string, PeriodDecision>) => void, onError?: OnErr): Unsub
  saveRoundMeta(meta: RoundMeta): Promise<void>
  subscribeRoundMetas(cb: (m: Record<number, RoundMeta>) => void, onError?: OnErr): Unsub
}

let storePromise: Promise<VotingStore> | null = null
export const votingDemo = () => import.meta.env.VITE_VOTING_DEMO === 'true'

export function getVotingStore(): Promise<VotingStore> {
  storePromise ??= votingDemo()
    ? import('./demoStore').then((m) => m.createDemoStore(window.localStorage))
    : import('./firestoreStore').then((m) => m.createFirestoreStore())
  return storePromise
}
