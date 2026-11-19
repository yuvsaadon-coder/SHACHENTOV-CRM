import type { Items } from '../../lib/algorithm'
import { EPS } from '../../lib/algorithm'

export type BasketState = 'empty' | 'ok' | 'warn' | 'over'

/** Cost of a basket against the given products (unknown/hidden products count 0, as in the legacy site). */
export function basketTotal(items: Items | undefined, products: { id: string; price: number }[]): number {
  const price = new Map(products.map((p) => [p.id, p.price]))
  let s = 0
  for (const [pid, q] of Object.entries(items ?? {})) s += (price.get(pid) ?? 0) * q
  return s
}

/** Legacy semantics: empty / ok / warn from 90% / over 100%. */
export function basketStatus(total: number, budget: number): { state: BasketState; pct: number } {
  const pct = budget > 0 ? (total / budget) * 100 : 0
  if (total < EPS) return { state: 'empty', pct }
  if (total > budget + EPS) return { state: 'over', pct }
  if (pct >= 90) return { state: 'warn', pct }
  return { state: 'ok', pct }
}

export const isBasketValid = (total: number, budget: number): boolean => total > EPS && total <= budget + EPS

/** A basket is unlocked once every earlier basket is filled and within budget (sequential locking). */
export function isUnlocked(idx: number, totals: number[], budgets: number[]): boolean {
  for (let i = 0; i < idx; i++) if (!isBasketValid(totals[i] ?? 0, budgets[i] ?? 0)) return false
  return true
}

export function clampQty(qty: number, max: number): number {
  return Math.max(0, Math.min(Math.floor(qty), max))
}

/** Drop zero quantities and products the coordinator cannot see before saving. */
export function cleanItems(items: Items | undefined, allowed: Set<string>): Items {
  const out: Items = {}
  for (const [pid, q] of Object.entries(items ?? {})) if (q > 0 && allowed.has(pid)) out[pid] = q
  return out
}
