import { expect, test, vi } from 'vitest'
import { analyzeQuote, MODEL, parseRequest, RequestError, type ParseClient } from '../lib/quotes/analyzeServer'
import { aiRequests } from '../lib/quotes/analyzeClient'
import { parseCsv } from '../lib/quotes/extract'

const catalog = [{ id: 'pasta', name: 'פסטה', price: 2.6 }, { id: 'rice', name: 'אורז', price: 6.61 }]

function fakeClient(parsed: unknown, stop_reason = 'end_turn') {
  const parse = vi.fn().mockResolvedValue({ parsed_output: parsed, stop_reason })
  return { client: { beta: { messages: { parse } } } as unknown as ParseClient, parse }
}

test('request validation: needs a catalog and either text or a supported file', () => {
  expect(() => parseRequest('nope')).toThrow(RequestError)
  expect(() => parseRequest(JSON.stringify({ catalog }))).toThrow(/no_content/)
  expect(() => parseRequest(JSON.stringify({ catalog, file: { mediaType: 'application/zip', base64: 'x' } }))).toThrow(/no_content/)
  expect(() => parseRequest(JSON.stringify({ catalog, text: 'x'.repeat(30_001) }))).toThrow(/text_too_long/)
  expect(parseRequest(JSON.stringify({ catalog, text: 'פסטה 2.9', supplierName: 'ספק' }))).toMatchObject({ text: 'פסטה 2.9', supplierName: 'ספק' })
})

test('calls Claude with structured output, fallbacks and the catalog; drops unknown ids and bad prices', async () => {
  const { client, parse } = fakeClient({
    lines: [
      { name: ' פסטה פנה ', unitPrice: 2.9, vatIncluded: false, matchId: 'pasta', emoji: '🍝', cat: 'dry', confidence: 0.95, note: '' },
      { name: 'דבש', unitPrice: 12.9, vatIncluded: false, matchId: 'honey-made-up', emoji: '🍯', cat: 'dry', confidence: 1.4, note: '' },
      { name: 'משלוח', unitPrice: 0, vatIncluded: null, matchId: null, emoji: '🚚', cat: 'dry', confidence: 0.2, note: '' },
    ],
  })
  const lines = await analyzeQuote(client, { catalog, supplierName: 'ספק יבשים', text: 'פסטה פנה | 2.90' })
  const args = parse.mock.calls[0]![0]
  expect(args.model).toBe(MODEL)
  expect(args.fallbacks).toBe('default')
  expect(args.betas).toContain('server-side-fallback-2026-07-01')
  expect(args.output_config.effort).toBe('low')
  expect(args.messages[0].content[0].text).toContain('pasta | פסטה | 2.6')
  expect(lines[0]).toMatchObject({ name: 'פסטה פנה', matchId: 'pasta', unitPrice: 2.9 })
  expect(lines[1]).toMatchObject({ matchId: null, confidence: 1 })
  expect(lines[2]!.unitPrice).toBeNull()
})

test('PDF and image quotes are sent as document / image blocks', async () => {
  const { client, parse } = fakeClient({ lines: [] })
  await analyzeQuote(client, { catalog, supplierName: '', file: { mediaType: 'application/pdf', base64: 'AAAA' } })
  await analyzeQuote(client, { catalog, supplierName: '', file: { mediaType: 'image/jpeg', base64: 'BBBB' } })
  expect(parse.mock.calls[0]![0].messages[0].content[0].type).toBe('document')
  expect(parse.mock.calls[1]![0].messages[0].content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } })
})

test('refusals and truncated answers become clear errors', async () => {
  await expect(analyzeQuote(fakeClient(null, 'refusal').client, { catalog, supplierName: '', text: 'x' })).rejects.toThrow(/refused/)
  await expect(analyzeQuote(fakeClient(null, 'max_tokens').client, { catalog, supplierName: '', text: 'x' })).rejects.toThrow(/too_many_lines/)
})

test('large spreadsheets are split into chunks; files go whole', () => {
  const rows = Array.from({ length: 60 }, (_, i) => [`מוצר ${i}`, String(i + 0.5)])
  expect(aiRequests({ kind: 'rows', rows })).toHaveLength(3)
  expect(aiRequests({ kind: 'file', mediaType: 'application/pdf', base64: 'x' })).toEqual([{ file: { mediaType: 'application/pdf', base64: 'x' } }])
})

test('csv parser handles quotes, semicolons and CRLF', () => {
  expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']])
  expect(parseCsv('שם;מחיר\nפסטה;2.9')).toEqual([['שם', 'מחיר'], ['פסטה', '2.9']])
})
