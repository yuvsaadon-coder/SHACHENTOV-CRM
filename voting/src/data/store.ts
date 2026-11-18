// Storage layer. Two implementations behind one interface:
//  - Firestore (legacy-compatible schema) when VITE_FIREBASE_* env vars are set
//  - Demo (browser localStorage) otherwise, so previews and E2E tests run without any backend.
import type { LegacyConfig, LegacyVote, RoundState } from './legacy'

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
