import { useEffect, useState } from 'react'
import { defaultConfig, type LegacyConfig, type LegacyVote } from './legacy'
import { getStore, type Store } from './store'

export function useStore(): Store | null {
  const [store, setStore] = useState<Store | null>(null)
  useEffect(() => { let alive = true; void getStore().then((s) => { if (alive) setStore(s) }); return () => { alive = false } }, [])
  return store
}

/** Live config. Missing fields fall back to the defaults (legacy data.js behaviour). null while loading. */
export function useConfig(store: Store | null): LegacyConfig | null {
  const [cfg, setCfg] = useState<LegacyConfig | null>(null)
  useEffect(() => {
    if (!store) return
    return store.subscribeConfig(
      (doc) => setCfg({ ...defaultConfig(), ...doc }),
      (e) => { console.warn('config load failed, using defaults', e); setCfg(defaultConfig()) },
    )
  }, [store])
  return cfg
}

export function useVotes(store: Store | null): Record<string, LegacyVote> {
  const [votes, setVotes] = useState<Record<string, LegacyVote>>({})
  useEffect(() => {
    if (!store) return
    return store.subscribeVotes(setVotes, (e) => console.error('votes subscription failed', e))
  }, [store])
  return votes
}

/** Draft basket contents, kept in this browser (as the legacy site did; cloud drafts arrive in Phase 2, VOTE-4). */
export function useLocalDraft<T>(key: string, initial: T): [T, (fn: (prev: T) => T) => void] {
  const [state, setState] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial } catch { return initial }
  })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(state)) }, [key, state])
  return [state, setState]
}
