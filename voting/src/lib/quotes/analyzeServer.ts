// Server-side core of the quote analysis (runs in the Netlify function). Separate from the handler so it can be
// unit-tested with a fake client. No browser APIs here.
import type Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { CatalogEntry, QuoteLine } from './types'

export const MODEL = 'claude-opus-5-5'
const MAX_TEXT = 30_000
const MAX_FILE_B64 = 5_600_000
const MAX_CATALOG = 500
const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export class RequestError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}

export interface AnalyzeInput {
  catalog: CatalogEntry[]
  supplierName: string
  text?: string
  file?: { mediaType: (typeof FILE_TYPES)[number]; base64: string }
}

export function parseRequest(raw: string): AnalyzeInput {
  let body: unknown
  try { body = JSON.parse(raw) } catch { throw new RequestError(400, 'bad_json') }
  const b = body as Partial<AnalyzeInput>
  if (!Array.isArray(b.catalog) || b.catalog.length > MAX_CATALOG) throw new RequestError(400, 'bad_catalog')
  const catalog = b.catalog
    .filter((p): p is CatalogEntry => !!p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p) => ({ id: p.id.slice(0, 80), name: p.name.slice(0, 120), price: Number(p.price) || 0 }))
  const supplierName = typeof b.supplierName === 'string' ? b.supplierName.slice(0, 80) : ''
  if (typeof b.text === 'string' && b.text.trim()) {
    if (b.text.length > MAX_TEXT) throw new RequestError(413, 'text_too_long')
    return { catalog, supplierName, text: b.text }
  }
  const f = b.file
  if (f && typeof f.base64 === 'string' && FILE_TYPES.includes(f.mediaType)) {
    if (f.base64.length > MAX_FILE_B64) throw new RequestError(413, 'file_too_big')
    return { catalog, supplierName, file: { mediaType: f.mediaType, base64: f.base64 } }
  }
  throw new RequestError(400, 'no_content')
}

export const QuoteSchema = z.object({
  lines: z.array(z.object({
    name: z.string(),
    unitPrice: z.number().nullable(),
    vatIncluded: z.boolean().nullable(),
    matchId: z.string().nullable(),
    emoji: z.string(),
    cat: z.enum(['dry', 'fresh']),
    confidence: z.number(),
    note: z.string(),
  })),
})

export const SYSTEM = `You read supplier price quotes for "Shachen Tov", a Jerusalem food-distribution nonprofit, and turn them into price updates for its product catalog. Quotes are usually in Hebrew and come as spreadsheets, PDFs or photos.

For every product line that has a price, return one entry:
- name: the product name as written in the quote (Hebrew, without the price).
- unitPrice: the price of ONE single unit as it goes into a family's food basket (one bag of pasta, one can of tuna, one tray of eggs). If the quote prices a carton/pack of N units, divide by N and say so in note. If several prices appear, use the unit price, not the line total or quantity. null if there is no usable price.
- vatIncluded: true if the price includes VAT (כולל מע"מ), false if it is before VAT (לפני מע"מ / ללא מע"מ), null if the quote does not say. A statement for the whole document applies to every line.
- matchId: the id of the catalog product this line is the same product as (same kind of food; size and brand may differ), or null when it is a product the catalog does not have. Never invent ids; use only ids from the catalog list. Do not match two different products to the same id unless they really are the same product.
- emoji: one emoji that fits the product (used as its icon for new products).
- cat: "fresh" for vegetables, fruit, eggs, meat, poultry, dairy, bread and challah; otherwise "dry".
- confidence: 0 to 1, how sure you are about both the match and the unit price.
- note: a very short Hebrew note for the administrator only when something needs attention (pack size divided, unit unclear, price looks unusual compared with the current catalog price); otherwise an empty string.

Skip headers, totals, delivery fees, discounts and lines without a product. Return the lines in the order they appear.`

function catalogText(catalog: CatalogEntry[]): string {
  return catalog.map((p) => `${p.id} | ${p.name} | ${p.price}`).join('\n')
}

/** Minimal surface of the SDK we use, so tests can pass a fake. */
export type ParseClient = Pick<Anthropic, 'beta'>

export async function analyzeQuote(client: ParseClient, input: AnalyzeInput): Promise<QuoteLine[]> {
  const intro = `Catalog (id | name | current price in ILS incl. VAT):\n${catalogText(input.catalog)}\n\nSupplier: ${input.supplierName || 'unknown'}`
  const content: Anthropic.Beta.BetaContentBlockParam[] = input.file
    ? [
        input.file.mediaType === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.file.base64 } }
          : { type: 'image', source: { type: 'base64', media_type: input.file.mediaType, data: input.file.base64 } },
        { type: 'text', text: `${intro}\n\nRead the attached quote.` },
      ]
    : [{ type: 'text', text: `${intro}\n\nQuote content (one row per line, cells separated by |):\n<quote>\n${input.text}\n</quote>` }]

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // Low effort keeps each call within Netlify's function time limit; the admin reviews every line anyway.
    output_config: { effort: 'low', format: betaZodOutputFormat(QuoteSchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  })
  if (response.stop_reason === 'refusal') throw new RequestError(422, 'refused')
  if (response.stop_reason === 'max_tokens') throw new RequestError(413, 'too_many_lines')
  const parsed = response.parsed_output
  if (!parsed) throw new RequestError(502, 'unparsed')

  const ids = new Set(input.catalog.map((p) => p.id))
  return parsed.lines.map((l) => ({
    ...l,
    name: l.name.trim(),
    unitPrice: l.unitPrice != null && l.unitPrice > 0 ? l.unitPrice : null,
    matchId: l.matchId && ids.has(l.matchId) ? l.matchId : null, // never trust an id the catalog does not have
    emoji: [...(l.emoji || '🛒')].slice(0, 2).join(''),
    confidence: Math.max(0, Math.min(1, l.confidence)),
  }))
}
