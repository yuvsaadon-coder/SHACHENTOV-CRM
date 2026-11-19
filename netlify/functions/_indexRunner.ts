/**
 * Reads the text out of every uploaded file into Firestore collection file_texts/{sha256(key)}.
 * Shared by index-files (quick, no OCR) and index-files-background (OCR of scanned PDFs).
 */
import { Buffer } from 'node:buffer'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { extractText } from './_extractText'
import { collectSources, sha256, STORAGE_HOSTS, type FileEntry, type Sources } from './_fileSources'

const MAX_BYTES = 25 * 1024 * 1024
const OCR_MAX_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 200_000
const FETCH_TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 2

export interface StoredMeta {
  key?: string; sourceHash?: string; error?: string | null; attempts?: number; places?: unknown; scanned?: boolean; ocrAttempted?: boolean
}

/** Bytes of a file: inline data is decoded here; anything else only from the site or Firebase Storage. */
export async function fetchBytes(entry: FileEntry, siteHost: string): Promise<Uint8Array> {
  if (entry.kind === 'data') {
    const m = entry.url.match(/^data:[^;,]*(;base64)?,(.*)$/s)
    if (!m) throw new Error('כתובת data לא תקינה')
    const bytes = m[1] ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]))
    if (bytes.length > MAX_BYTES) throw new Error('הקובץ גדול מדי')
    return new Uint8Array(bytes)
  }
  const allowed = new Set([siteHost, ...STORAGE_HOSTS])
  let url = new URL(entry.url)
  for (let hop = 0; hop <= 3; hop++) {
    if (url.protocol !== 'https:' || !allowed.has(url.host)) throw new Error(`מארח לא מורשה: ${url.host}`)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { redirect: 'manual', signal: ctl.signal })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location')!, url)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('הקובץ גדול מדי')
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.length > MAX_BYTES) throw new Error('הקובץ גדול מדי')
      return buf
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('יותר מדי הפניות')
}

/** Claude reads the pages of a scanned PDF and returns the text. */
export async function ocrPdf(pdf: Uint8Array): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY חסר')
  if (pdf.length > OCR_MAX_BYTES) throw new Error('הקובץ גדול מדי לזיהוי תווים (מעל 10MB)')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 32000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(pdf).toString('base64') } },
          { type: 'text', text: 'תמלל את כל הטקסט שבמסמך כפי שהוא, עמוד אחר עמוד (עברית ושפות אחרות, כולל טבלאות ומספרים), בלי הסברים ובלי הערות משלך.' },
        ],
      }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  return data.content?.find((c) => c.type === 'text')?.text ?? ''
}

export async function readMeta(db: Firestore): Promise<Map<string, StoredMeta>> {
  const snap = await db.collection('file_texts').select('key', 'sourceHash', 'error', 'attempts', 'places', 'scanned', 'ocrAttempted').get()
  return new Map(snap.docs.map((d) => [d.id, d.data() as StoredMeta]))
}

export const idOf = (e: FileEntry) => sha256(e.key)

export const stateOf = (e: FileEntry, meta: StoredMeta | undefined): 'indexed' | 'failed' | 'pending' => {
  if (!meta || meta.sourceHash !== e.sourceHash) return 'pending'
  if (meta.error) return (meta.attempts ?? 1) >= MAX_ATTEMPTS ? 'failed' : 'pending'
  return 'indexed'
}

const needsOcr = (e: FileEntry, meta: StoredMeta | undefined) =>
  !!meta && meta.sourceHash === e.sourceHash && !meta.error && meta.scanned === true && !meta.ocrAttempted

export async function indexStatus(db: Firestore, siteOrigin: string, staticFiles: string[]) {
  const sources = await collectSources(db, siteOrigin, staticFiles)
  const meta = await readMeta(db)
  let indexed = 0, failed = 0, pending = 0, ocrPending = 0
  for (const e of sources.files) {
    const m = meta.get(idOf(e))
    const s = stateOf(e, m)
    if (s === 'indexed') indexed++
    else if (s === 'failed') failed++
    else pending++
    if (needsOcr(e, m)) ocrPending++
  }
  return { total: sources.files.length, indexed, pending, failed, ocrPending, links: sources.links.length, warnings: sources.warnings }
}

export interface RunOptions {
  /** Transcribe scanned PDFs with Claude. Slow: use only from the background function. */
  ocr: boolean
  /** Only the files that were found to be scans and have not had OCR yet. */
  onlyScanned: boolean
  force: boolean
  budgetMs: number
  concurrency: number
}

export async function runIndex(db: Firestore, siteOrigin: string, staticFiles: string[], opts: RunOptions) {
  const sources: Sources = await collectSources(db, siteOrigin, staticFiles)
  const meta = await readMeta(db)
  const siteHost = new URL(siteOrigin).host

  // Keep the "where is it attached" list current for files that did not change.
  const refresh = sources.files.filter((e) => {
    const m = meta.get(idOf(e))
    return m && m.sourceHash === e.sourceHash && JSON.stringify(m.places) !== JSON.stringify(e.places)
  })
  for (let i = 0; i < refresh.length; i += 400) {
    const batch = db.batch()
    for (const e of refresh.slice(i, i + 400)) batch.update(db.collection('file_texts').doc(idOf(e)), { places: e.places, name: e.name, sourceLabel: e.places[0]?.label ?? '' })
    await batch.commit()
  }

  const queue = sources.files.filter((e) => {
    const m = meta.get(idOf(e))
    if (opts.onlyScanned) return needsOcr(e, m)
    return opts.force || stateOf(e, m) === 'pending'
  })

  const started = Date.now()
  let done = 0, failed = 0, next = 0
  const processOne = async (e: FileEntry) => {
    const ref = db.collection('file_texts').doc(idOf(e))
    const base = { key: e.key, name: e.name, ext: e.ext, sourceType: e.places[0]?.type ?? '', sourceLabel: e.places[0]?.label ?? '', places: e.places, sourceHash: e.sourceHash }
    try {
      const bytes = await fetchBytes(e, siteHost)
      const r = await extractText(bytes, e.name, opts.ocr ? { ocr: ocrPdf } : {})
      await ref.set({
        ...base, kind: r.kind, text: r.text.slice(0, MAX_TEXT_CHARS), chars: Math.min(r.text.length, MAX_TEXT_CHARS),
        pages: r.pages ?? null, scanned: !!r.scanned, note: r.note ?? null, error: null, attempts: 0,
        ocrAttempted: opts.ocr, indexedAt: FieldValue.serverTimestamp(),
      })
      done++
    } catch (err) {
      const prev = meta.get(idOf(e))
      const attempts = (prev?.sourceHash === e.sourceHash ? (prev.attempts ?? 0) : 0) + 1
      const msg = (err instanceof Error ? err.message : String(err)).slice(0, 300)
      if (opts.onlyScanned) {
        // The earlier result (a scan with no text) stays; just record that OCR was tried and why it failed.
        await ref.set({ note: `זיהוי התווים נכשל: ${msg}`, ocrAttempted: true }, { merge: true })
      } else {
        await ref.set({
          ...base, kind: 'unsupported', text: '', chars: 0, scanned: false, note: null, error: msg, attempts, ocrAttempted: false,
          indexedAt: FieldValue.serverTimestamp(),
        })
      }
      failed++
    }
  }
  const worker = async () => {
    while (next < queue.length && Date.now() - started < opts.budgetMs) await processOne(queue[next++])
  }
  await Promise.all(Array.from({ length: opts.concurrency }, worker))

  const remaining = queue.length - next
  if (remaining === 0 && !opts.onlyScanned) {
    // Files that were removed from the system no longer belong in the index.
    const live = new Set(sources.files.map(idOf))
    const stale = [...meta.keys()].filter((k) => !live.has(k))
    for (let i = 0; i < stale.length; i += 400) {
      const batch = db.batch()
      for (const k of stale.slice(i, i + 400)) batch.delete(db.collection('file_texts').doc(k))
      await batch.commit()
    }
  }
  return { done, failed, remaining, total: sources.files.length }
}
