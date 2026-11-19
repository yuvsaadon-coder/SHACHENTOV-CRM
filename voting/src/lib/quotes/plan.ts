// Turn analysed quote lines into proposed catalog changes, and apply the approved ones. Pure.
import type { LegacyProduct } from '../../data/legacy'
import type { CatalogEntry, Proposal, QuoteLine, VatMode } from './types'
import { VAT_RATE } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Catalog prices include VAT (as the legacy prices do). */
export function finalPrice(line: QuoteLine, vatMode: VatMode): number | null {
  if (line.unitPrice == null || !(line.unitPrice > 0)) return null
  const included = vatMode === 'included' ? true : vatMode === 'excluded' ? false : line.vatIncluded !== false
  return round2(included ? line.unitPrice : line.unitPrice * (1 + VAT_RATE))
}

export function buildProposals(lines: QuoteLine[], catalog: CatalogEntry[], vatMode: VatMode): Proposal[] {
  const byId = new Map(catalog.map((p) => [p.id, p]))
  const seen = new Set<string>()
  return lines.map((line, i) => {
    const match = line.matchId ? byId.get(line.matchId) : undefined
    const newPrice = finalPrice(line, vatMode)
    // a product matched twice: keep the first, the rest start as "ignore" for the admin to decide
    const dup = !!match && seen.has(match.id)
    if (match) seen.add(match.id)
    const action = newPrice == null || dup ? 'ignore' : match ? 'update' : 'add'
    return {
      key: `${i}-${line.name}`, line, action, productId: match?.id ?? null, oldPrice: match?.price ?? null, newPrice,
      newName: line.name, emoji: line.emoji || '🛒', cat: line.cat, cheaper: null,
    }
  })
}

/**
 * Price-history rule (owner 19.11.2026): the catalog follows the CHEAPEST offer for the period.
 * A line that is more expensive than an offer already received becomes "record only".
 * When the quote is for an older period than the latest tracked one, catalog updates also default to "record".
 */
export function applyCheapestRule(
  proposals: Proposal[], bestByKey: Record<string, { price: number; supplier: string }>, catalogFollowsPeriod: boolean,
): Proposal[] {
  return proposals.map((p) => {
    const best = p.productId ? bestByKey[p.productId] : undefined
    const cheaper = best && p.newPrice != null && best.price < p.newPrice - 1e-9 ? { price: best.price, supplier: best.supplier } : null
    const demote = p.action === 'update' && (cheaper || !catalogFollowsPeriod)
    return { ...p, cheaper, action: demote ? 'record' : p.action }
  })
}

/** Key under which a line is kept in the price history. */
export function offerKey(p: Proposal, addedIds: Record<string, string>): string | null {
  if (p.action === 'add') return addedIds[p.key] ?? null
  if (p.productId) return p.productId
  return p.action === 'record' && p.newName.trim() ? `name:${p.newName.trim()}` : null
}

export interface ApplyResult { products: LegacyProduct[]; updated: number; added: number; addedIds: Record<string, string> }

export function applyProposals(products: LegacyProduct[], proposals: Proposal[], opts: { supplierId?: string; idPrefix: string }): ApplyResult {
  const out = products.map((p) => ({ ...p }))
  const idx = new Map(out.map((p, i) => [p.id, i]))
  let updated = 0, added = 0
  const addedIds: Record<string, string> = {}
  let order = out.reduce((m, p) => Math.max(m, Number(p.sortOrder ?? 0)), -1)
  proposals.forEach((pr, n) => {
    if (pr.newPrice == null) return
    if (pr.action === 'update' && pr.productId != null && idx.has(pr.productId)) {
      const p = out[idx.get(pr.productId)!]!
      if (Math.abs(Number(p.price) - pr.newPrice) > 1e-9) { p.price = pr.newPrice; updated++ }
    } else if (pr.action === 'add' && pr.newName.trim()) {
      addedIds[pr.key] = `${opts.idPrefix}-${n}`
      out.push({
        id: `${opts.idPrefix}-${n}`, name: pr.newName.trim(), price: pr.newPrice, max: 10, cat: pr.cat,
        emoji: pr.emoji || '🛒', excludedBranches: [], active: true, sortOrder: ++order,
        ...(opts.supplierId ? { supplier: opts.supplierId } : {}),
      })
      added++
    }
  })
  return { products: out, updated, added, addedIds }
}

export function pctChange(oldPrice: number | null, newPrice: number | null): number | null {
  if (oldPrice == null || newPrice == null || !(oldPrice > 0)) return null
  return ((newPrice - oldPrice) / oldPrice) * 100
}
