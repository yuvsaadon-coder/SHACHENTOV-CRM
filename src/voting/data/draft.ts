import { useEffect, useState } from 'react'

/** Draft kept in this browser per key. When the key changes (another coordinator/branch), the draft of that key is loaded. */
export function useLocalDraft<T>(key: string, initial: T): [T, (fn: (prev: T) => T) => void] {
  const load = (k: string): T => { try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : initial } catch { return initial } }
  const [entry, setEntry] = useState<{ key: string; value: T }>(() => ({ key, value: load(key) }))
  const current = entry.key === key ? entry.value : load(key)
  useEffect(() => { if (entry.key === key) localStorage.setItem(key, JSON.stringify(entry.value)) }, [entry, key])
  const set = (fn: (prev: T) => T) => setEntry((e) => ({ key, value: fn(e.key === key ? e.value : load(key)) }))
  return [current, set]
}
