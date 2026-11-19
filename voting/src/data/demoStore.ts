import type { LegacyConfig, LegacyVote } from './legacy'
import type { ConfigField, ConfigValue, QuoteRecord, Store } from './store'
import { decisionKey, type PeriodDecision } from '../lib/prices/history'
import type { RoundMeta } from '../lib/rounds/recommend'

const K_CONFIG = 'shachen-tov-demo-config'
const K_VOTES = 'shachen-tov-demo-votes'
const K_ARCHIVE = 'shachen-tov-demo-archived-votes'
const K_QUOTES = 'shachen-tov-demo-price-quotes'
const K_DECISIONS = 'shachen-tov-demo-price-decisions'
const K_ROUNDS = 'shachen-tov-demo-rounds'

/** Browser-only store for previews/E2E. Same semantics as the Firestore store. */
export function createDemoStore(ls: Storage): Store {
  const read = <T,>(k: string, fallback: T): T => {
    try { const raw = ls.getItem(k); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
  }
  const write = (k: string, v: unknown) => { ls.setItem(k, JSON.stringify(v)); emit() }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  // Other tabs of the same browser (e.g. survey in one tab, admin in another)
  if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key?.startsWith('shachen-tov-demo')) emit() })
  const subscribe = (fn: () => void) => { listeners.add(fn); queueMicrotask(fn); return () => { listeners.delete(fn) } }

  return {
    mode: 'demo',
    subscribeConfig(cb) {
      return subscribe(() => cb(read<Partial<LegacyConfig> | null>(K_CONFIG, null)))
    },
    async updateConfigField<F extends ConfigField>(field: F, value: ConfigValue<F>) {
      write(K_CONFIG, { ...read<Partial<LegacyConfig>>(K_CONFIG, {}), [field]: value })
    },
    subscribeVotes(cb) {
      return subscribe(() => cb(read<Record<string, LegacyVote>>(K_VOTES, {})))
    },
    async submitVote(vote) {
      write(K_VOTES, { ...read<Record<string, LegacyVote>>(K_VOTES, {}), [vote.coordinatorId]: vote })
    },
    async archiveAllVotes(reason, roundNum) {
      const votes = read<Record<string, LegacyVote>>(K_VOTES, {})
      const archive = read<unknown[]>(K_ARCHIVE, [])
      const now = Date.now()
      for (const v of Object.values(votes)) archive.push({ ...v, round: roundNum, archivedReason: reason, archivedAt: now })
      ls.setItem(K_ARCHIVE, JSON.stringify(archive))
      write(K_VOTES, {})
    },
    async saveQuoteRecord(rec) {
      write(K_QUOTES, [rec, ...read<QuoteRecord[]>(K_QUOTES, [])].slice(0, 30))
    },
    subscribeQuoteRecords(cb) {
      return subscribe(() => cb(read<QuoteRecord[]>(K_QUOTES, [])))
    },
    async saveSupplierChoice(periodId, category, supplierName, decidedAt) {
      const all = read<Record<string, PeriodDecision>>(K_DECISIONS, {})
      const k = decisionKey(periodId, category)
      write(K_DECISIONS, { ...all, [k]: { ...all[k], periodId, category, supplierName, decidedAt } })
    },
    async saveDiscount(periodId, category, discount) {
      const all = read<Record<string, PeriodDecision>>(K_DECISIONS, {})
      const k = decisionKey(periodId, category)
      write(K_DECISIONS, { ...all, [k]: { ...(all[k] ?? { periodId, category, supplierName: '', decidedAt: 0 }), discount } })
    },
    async saveRoundMeta(meta) {
      const all = read<Record<number, RoundMeta>>(K_ROUNDS, {})
      write(K_ROUNDS, { ...all, [meta.num]: { ...all[meta.num], ...meta } })
    },
    subscribeRoundMetas(cb) {
      return subscribe(() => cb(read<Record<number, RoundMeta>>(K_ROUNDS, {})))
    },
    async loadArchivedVotes(round) {
      return read<(LegacyVote & { round?: number })[]>(K_ARCHIVE, []).filter((v) => v.round === round)
    },
    subscribeDecisions(cb) {
      return subscribe(() => cb(read<Record<string, PeriodDecision>>(K_DECISIONS, {})))
    },
  }
}
