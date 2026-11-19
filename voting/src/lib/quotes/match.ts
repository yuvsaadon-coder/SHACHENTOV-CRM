// Hebrew-aware fuzzy matching of quote names to catalog products. Pure.
import type { CatalogEntry } from './types'

const NIQQUD = /[֑-ׇ]/g
const FINAL: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }
/** Words that describe packaging/brand noise rather than the product. */
const NOISE = new Set([
  'גרם', 'גר', 'ג', 'קג', 'ק"ג', 'קילו', 'ליטר', 'ל', 'מל', 'מ"ל', 'יח', 'יחידות', 'יחידה', 'אריזה', 'קרטון', 'שקית',
  'פחית', 'בקבוק', 'צנצנת', 'של', 'עם', 'כשר', 'לפסח', 'מהדרין', 'בדץ', 'בד"ץ', 'מארז', 'ארגז', 'x', 'pcs',
])

export function normalizeName(s: string): string {
  return s
    .replace(NIQQUD, '')
    .replace(/[׳'"״`]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINAL[c] ?? c)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t && !NOISE.has(t) && !/^\d+$/.test(t))
    // strip the Hebrew definite article / conjunction prefix on longer words
    .map((t) => (t.length > 3 && /^[הו]/.test(t) ? t.slice(1) : t))
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  const x = ` ${s} `
  for (let i = 0; i < x.length - 1; i++) { const g = x.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1) }
  return m
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0
  const A = bigrams(a), B = bigrams(b)
  let inter = 0, total = 0
  for (const [g, n] of A) { inter += Math.min(n, B.get(g) ?? 0); total += n }
  for (const n of B.values()) total += n
  return total ? (2 * inter) / total : 0
}

/** Similarity in [0,1] between a quote name and a catalog name. */
export function similarity(quoteName: string, catalogName: string): number {
  const qt = tokens(quoteName), ct = tokens(catalogName)
  if (!qt.length || !ct.length) return 0
  const q = qt.join(' '), c = ct.join(' ')
  if (q === c) return 1
  // every catalog word appears in the quote name ("פסטה פנה 500 גרם" contains "פסטה")
  const covered = ct.filter((w) => qt.some((x) => x === w || (w.length >= 3 && (x.startsWith(w) || w.startsWith(x))))).length / ct.length
  return Math.max(covered * 0.9, dice(q, c))
}

export const MATCH_THRESHOLD = 0.6

export function bestMatch(name: string, catalog: CatalogEntry[]): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null
  for (const p of catalog) {
    const score = similarity(name, p.name)
    if (!best || score > best.score + 1e-9) best = { id: p.id, score }
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null
}
