// Storage layer. Two implementations behind one interface:
//  - Firestore (legacy-compatible schema) when VITE_FIREBASE_* env vars are set
//  - Demo (browser localStorage) otherwise, so previews and E2E tests run without any backend.
import type { LegacyConfig, LegacyVote, RoundState } from './legacy'
import type { Discount, PeriodDecision } from '../lib/prices/history'
import type { RoundMeta } from '../lib/rounds/recommend'

/** History entry for an applied supplier quote (no files are stored; Spark plan has no Storage). */
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
  /** half-year order this quote is for (price history) */
  periodId?: string
  /** every approved offer of the quote, incl. VAT, for the price history */
  offers?: { key: string; name: string; productId: string | null; price: number; emoji?: string; cat?: 'dry' | 'fresh' }[]
}

export type ConfigField = 'products' | 'coordinators' | 'baskets' | 'round'
export type ConfigValue<F extends ConfigField> = F extends 'round' ? RoundState : LegacyConfig[Exclude<F, 'round'>]

export interface Store {
  mode: 'firestore' | 'demo'
  /** null = no config document yet (callers fall back to defaultConfig()) */
  subscribeConfig(cb: (cfg: Partial<LegacyConfig> | null) => void, onError?: (e: Error) => void): () => void
  /** Writes ONE field of config/main. Never replaces the whole document (SPEC D5). */
  updateConfigField<F extends ConfigField>(field: F, value: ConfigValue<F>): Promise<void>
  subscribeVotes(cb: (votes: Record<string, LegacyVote>) => void, onError?: (e: Error) => void): () => void
  submitVote(vote: LegacyVote): Promise<void>
  /** Moves every vote to archivedVotes with a reason, then removes it from votes (CYC-10: never just delete). */
  archiveAllVotes(reason: string, roundNum: number): Promise<void>
  saveQuoteRecord(rec: QuoteRecord): Promise<void>
  subscribeQuoteRecords(cb: (recs: QuoteRecord[]) => void, onError?: (e: Error) => void): () => void
  /** Which supplier a half-year order goes to (one document per period; each field written on its own). */
  saveSupplierChoice(periodId: string, category: string, supplierName: string, decidedAt: number): Promise<void>
  saveDiscount(periodId: string, category: string, discount: Discount | null): Promise<void>
  /** Round history (one document per round): order type, budgets, price snapshot at opening. */
  saveRoundMeta(meta: RoundMeta): Promise<void>
  subscribeRoundMetas(cb: (m: Record<number, RoundMeta>) => void, onError?: (e: Error) => void): () => void
  /** Votes archived when a round was closed/reset (for the budget recommendation). */
  loadArchivedVotes(round: number): Promise<LegacyVote[]>
  /** keyed by decisionKey(periodId, category) */
  subscribeDecisions(cb: (d: Record<string, PeriodDecision>) => void, onError?: (e: Error) => void): () => void
}

let storePromise: Promise<Store> | null = null

export function firebaseConfigured(): boolean {
  const env = import.meta.env
  return !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID)
}

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = firebaseConfigured()
      ? import('./firestoreStore').then((m) => m.createFirestoreStore())
      : import('./demoStore').then((m) => m.createDemoStore(window.localStorage))
  }
  return storePromise
}
