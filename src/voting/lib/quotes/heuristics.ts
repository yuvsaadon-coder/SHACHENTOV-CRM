// Local (no-AI) reading of a quote: find name + price on each row/line. Pure.
// Used when the AI analysis is unavailable, and to cut large quotes into chunks for the AI.
import { guessEmoji } from './emoji'
import { bestMatch } from './match'
import type { CatalogEntry, QuoteLine } from './types'

const NAME_HEAD = /תאור|תיאור|מוצר|פריט|שם|description|item|product/i
const PRICE_HEAD = /מחיר|price|ש"ח|ש״ח|₪|עלות/i
const TOTAL_HEAD = /סה"כ|סה״כ|סך|total|כמות|qty|quantity|ברקוד|barcode|מק"ט|מק״ט|קוד/i
const VAT_EXCL = /לפני מע"מ|לפני מע״מ|ללא מע"מ|ללא מע״מ|לא כולל מע|before vat|excl/i
const VAT_INCL = /כולל מע"מ|כולל מע״מ|incl/i

export function parseNumber(s: string): number | null {
  const m = String(s).replace(/[,₪\s]/g, '').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = parseFloat(m[0])
  return Number.isFinite(n) ? n : null
}

const isTexty = (s: string) => /[\p{L}]{2,}/u.test(s) && !/^\s*[\d.,₪\s%-]+\s*$/.test(s)

export function detectVat(text: string): boolean | null {
  if (VAT_EXCL.test(text)) return false
  if (VAT_INCL.test(text)) return true
  return null
}

function lineFrom(name: string, price: number | null, vat: boolean | null, catalog: CatalogEntry[], note = ''): QuoteLine {
  const m = bestMatch(name, catalog)
  const g = guessEmoji(name)
  return {
    name: name.trim(), unitPrice: price, vatIncluded: vat, matchId: m?.id ?? null, emoji: g.emoji, cat: g.cat,
    confidence: m ? Math.min(0.9, m.score) : 0.4, note,
  }
}

/** Table rows (Excel/CSV). Uses a header row when one exists, otherwise the longest text cell + last price-like number. */
export function linesFromRows(rows: string[][], catalog: CatalogEntry[]): QuoteLine[] {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c))
  const allText = clean.map((r) => r.join(' ')).join('\n')
  const docVat = detectVat(allText)
  let nameCol = -1, priceCol = -1, start = 0
  for (let i = 0; i < Math.min(clean.length, 25); i++) {
    const r = clean[i]!
    const n = r.findIndex((c) => NAME_HEAD.test(c) && !PRICE_HEAD.test(c))
    // prefer a unit-price column over a total column
    const pIdx = r.map((c, j) => (PRICE_HEAD.test(c) && !/סה"כ|סה״כ|total/i.test(c) ? j : -1)).filter((j) => j >= 0)
    if (n >= 0 && pIdx.length) { nameCol = n; priceCol = pIdx[0]!; start = i + 1; break }
  }
  const out: QuoteLine[] = []
  for (const r of clean.slice(start)) {
    let name: string | undefined, price: number | null = null
    if (nameCol >= 0) {
      name = r[nameCol]
      price = parseNumber(r[priceCol] ?? '')
    } else {
      const texts = r.filter(isTexty).filter((c) => !TOTAL_HEAD.test(c))
      name = texts.sort((a, b) => b.length - a.length)[0]
      const nums = r.filter((c) => !isTexty(c)).map(parseNumber).filter((n): n is number => n != null && n > 0)
      // a decimal number is far more likely a price than an integer quantity/barcode
      price = nums.find((n) => !Number.isInteger(n)) ?? nums.at(-1) ?? null
    }
    if (!name || !isTexty(name) || price == null || price <= 0 || price > 10_000) continue
    out.push(lineFrom(name, price, detectVat(r.join(' ')) ?? docVat, catalog))
  }
  return out
}

/** Free text (PDF/plain): one product per line, name followed or preceded by a price. */
export function linesFromText(text: string, catalog: CatalogEntry[]): QuoteLine[] {
  const docVat = detectVat(text)
  const out: QuoteLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || !isTexty(line)) continue
    const nums = [...line.matchAll(/\d+(?:[.,]\d{1,2})?/g)].map((m) => parseFloat(m[0].replace(',', '.')))
    const price = nums.find((n) => !Number.isInteger(n)) ?? nums.at(-1)
    if (price == null || price <= 0 || price > 10_000) continue
    const name = line.replace(/\d+(?:[.,]\d+)?/g, ' ').replace(/[₪|:;\-–]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!isTexty(name) || TOTAL_HEAD.test(name) && name.length < 8) continue
    out.push(lineFrom(name, price, docVat, catalog))
  }
  return out
}

/** Plain-text lines of a source, for chunked AI analysis. */
export function rowsToText(rows: string[][]): string[] {
  return rows.map((r) => r.map((c) => String(c ?? '').trim()).filter(Boolean).join(' | ')).filter(Boolean)
}

/** Split lines into chunks, repeating the header (first lines) in each chunk for context. */
export function chunkLines(lines: string[], size = 40, headerLines = 3): string[] {
  if (lines.length <= size) return [lines.join('\n')]
  const header = lines.slice(0, headerLines)
  const body = lines.slice(headerLines)
  const chunks: string[] = []
  for (let i = 0; i < body.length; i += size) chunks.push([...header, ...body.slice(i, i + size)].join('\n'))
  return chunks
}
