// Choosing the period's supplier updates the catalog (= the prices coordinators see in the survey). Pure.
import type { LegacyProduct } from '../../data/model'
import { normalizeName } from '../quotes/match'
import type { SupplierQuote } from './suppliers'

export interface ChoiceResult {
  products: LegacyProduct[]
  updated: number
  added: number
  /** catalog products the chosen supplier did not quote (their price is left as is) */
  notOffered: string[]
}

export function applySupplierChoice(
  products: LegacyProduct[], quote: SupplierQuote, opts: { idPrefix: string; supplierId?: string; hideNotOffered?: boolean },
): ChoiceResult {
  const out = products.map((p) => ({ ...p }))
  const byId = new Map(out.map((p) => [p.id, p]))
  const byName = new Map(out.map((p) => [normalizeName(p.name), p]))
  let updated = 0, added = 0, n = 0
  let order = out.reduce((m, p) => Math.max(m, Number(p.sortOrder ?? 0)), -1)
  const quoted = new Set<string>()
  for (const [key, price] of Object.entries(quote.prices)) {
    const meta = quote.meta[key]
    const target = byId.get(key) ?? (meta ? byName.get(normalizeName(meta.name)) : undefined)
    const rounded = Math.round(price * 100) / 100
    if (target) {
      quoted.add(target.id)
      if (Math.abs(Number(target.price) - rounded) > 1e-9) { target.price = rounded; updated++ }
      if (opts.hideNotOffered && target.active === false) target.active = true // the supplier offers it again
    } else if (meta && !meta.productId) {
      const p: LegacyProduct = {
        id: `${opts.idPrefix}-${n++}`, name: meta.name, price: rounded, max: 10, cat: meta.cat ?? 'dry', emoji: meta.emoji || '🛒',
        excludedBranches: [], active: true, sortOrder: ++order, ...(opts.supplierId ? { supplier: opts.supplierId } : {}),
      }
      out.push(p); byName.set(normalizeName(p.name), p); quoted.add(p.id); added++
    }
  }
  // only products of the same supplier category count as "not offered" (dry quote vs fresh products are unrelated)
  const scope = opts.supplierId ? (p: LegacyProduct) => (p.supplier ?? 'dry') === opts.supplierId : () => true
  const notOffered = products.filter((p) => scope(p) && p.active !== false && !quoted.has(p.id)).map((p) => p.id)
  if (opts.hideNotOffered) for (const id of notOffered) byId.get(id)!.active = false
  return { products: out, updated, added, notOffered }
}
