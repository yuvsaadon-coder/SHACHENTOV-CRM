// Browser side: send a quote to the Netlify function in small chunks; fall back to local reading without AI.
import { chunkLines, linesFromRows, linesFromText, rowsToText } from './heuristics'
import type { ReadFile } from './extract'
import type { CatalogEntry, QuoteLine, QuoteSource } from './types'

export const ENDPOINT = '/.netlify/functions/analyze-quote'
const CHUNK_LINES = 25
const PARALLEL = 3

/** The AI analysis is not reachable here (no function deployed, no API key). Fall back to local reading. */
export class AiUnavailableError extends Error {}
export class AiFailedError extends Error {
  constructor(public code: string) { super(code) }
}

async function callOnce(body: object): Promise<QuoteLine[]> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new AiUnavailableError('network')
  }
  const ct = res.headers.get('content-type') ?? ''
  // 404 / HTML = no function on this host (local preview, demo); 503 = no or bad API key
  if (res.status === 404 || !ct.includes('json')) throw new AiUnavailableError(String(res.status))
  const data = (await res.json()) as { lines?: QuoteLine[]; error?: string }
  if (res.status === 503) throw new AiUnavailableError(data.error ?? '503')
  if (!res.ok || !Array.isArray(data.lines)) throw new AiFailedError(data.error ?? String(res.status))
  return data.lines
}

/** Work items for one file: text chunks for tables/text, the whole file for PDFs and photos. */
export function aiRequests(source: QuoteSource): ({ text: string } | { file: { mediaType: string; base64: string } })[] {
  if (source.kind === 'file') return [{ file: { mediaType: source.mediaType, base64: source.base64 } }]
  const lines = source.kind === 'rows' ? rowsToText(source.rows) : source.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.length ? chunkLines(lines, CHUNK_LINES).map((text) => ({ text })) : []
}

export async function analyzeWithAi(
  files: ReadFile[], catalog: CatalogEntry[], supplierName: string, onProgress: (done: number, total: number) => void,
): Promise<QuoteLine[]> {
  const jobs = files.flatMap((f) => aiRequests(f.source))
  const results: QuoteLine[][] = Array.from({ length: jobs.length }, () => [])
  let next = 0, done = 0
  onProgress(0, jobs.length)
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++
      results[i] = await callOnce({ ...jobs[i], catalog, supplierName })
      onProgress(++done, jobs.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker))
  return results.flat()
}

/** Local reading without AI. Returns the lines plus the names of files that could not be read this way. */
export async function analyzeLocally(files: ReadFile[], catalog: CatalogEntry[]): Promise<{ lines: QuoteLine[]; unreadable: string[] }> {
  const lines: QuoteLine[] = []
  const unreadable: string[] = []
  for (const f of files) {
    const src = await f.fallback()
    if (!src || src.kind === 'file') { unreadable.push(f.name); continue }
    lines.push(...(src.kind === 'rows' ? linesFromRows(src.rows, catalog) : linesFromText(src.text, catalog)))
  }
  return { lines, unreadable }
}
