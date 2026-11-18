import { useState } from 'react'

/** A message template kept in this browser, per key (e.g. branch + kind). */
export function useTemplate(key: string, fallback: string): [string, (v: string) => void, () => void] {
  const read = () => {
    try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
  }
  const [value, setValue] = useState(read)
  const save = (v: string) => {
    setValue(v)
    try { localStorage.setItem(key, v) } catch { /* storage unavailable: keep in memory */ }
  }
  const reset = () => save(fallback)
  return [value, save, reset]
}
