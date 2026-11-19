import type { Handler } from '@netlify/functions'
import { lookup } from 'node:dns/promises'
import { randomUUID } from 'node:crypto'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { corsHeaders, handleOptions } from './_cors'
import {
  COLLECTIONS, MAX_HTML_BYTES, MAX_IMAGE_BYTES, findIconCandidates, isAllowedContentType, isLogoCollection,
  isPrivateIp, isValidDocId, logoDownloadUrl, logoStoragePath, sniffImage, validateFetchUrl,
  type LogoCollection,
} from './_logoCore'

const FETCH_TIMEOUT_MS = 6000
const MAX_REDIRECTS = 3
const BULK_BUDGET_MS = 8000
const BULK_CONCURRENCY = 3
const USER_AGENT = 'Mozilla/5.0 (compatible; ShachenTovLogoBot/1.0)'

let bucketName = ''

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  const sa = JSON.parse(raw) as Record<string, string>
  bucketName = process.env.FIREBASE_STORAGE_BUCKET ?? `${sa.project_id}.firebasestorage.app`
  initializeApp({ credential: cert(sa), storageBucket: bucketName })
}

async function assertPublicHost(url: URL) {
  const addrs = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true })
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error('blocked host')
}

async function readBody(res: Response, max: number, truncate: boolean): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      if (!truncate) throw new Error('too large')
      chunks.push(value.slice(0, value.length - (total - max)))
      break
    }
    chunks.push(value)
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

/** GET with every hop checked: https only, public addresses only, redirects followed by hand. */
async function safeGet(start: string, max: number, truncate: boolean): Promise<{ url: URL; contentType: string; body: Uint8Array }> {
  let current = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = validateFetchUrl(current)
    if (!url) throw new Error('blocked url')
    await assertPublicHost(url)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,image/*;q=0.9,*/*;q=0.5' },
    })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      if (!location) throw new Error('bad redirect')
      current = new URL(location, url).href
      continue
    }
    if (!res.ok) throw new Error(`status ${res.status}`)
    return { url, contentType: res.headers.get('content-type') ?? '', body: await readBody(res, max, truncate) }
  }
  throw new Error('too many redirects')
}

async function findLogo(website: string): Promise<{ bytes: Uint8Array; mime: string; ext: string } | null> {
  let base = website
  let html = ''
  try {
    const page = await safeGet(website, MAX_HTML_BYTES, true)
    base = page.url.href
    html = new TextDecoder().decode(page.body)
  } catch { /* fall through to /favicon.ico */ }

  for (const candidate of findIconCandidates(html, base).slice(0, 6)) {
    try {
      const img = await safeGet(candidate, MAX_IMAGE_BYTES, false)
      if (!isAllowedContentType(img.contentType)) continue
      const kind = sniffImage(img.body)
      if (kind) return { bytes: img.body, ...kind }
    } catch { /* try the next candidate */ }
  }
  return null
}

async function processDoc(db: Firestore, collection: LogoCollection, id: string, recordFailure: boolean): Promise<{ ok: true; logoUrl: string } | { ok: false; error: string }> {
  const ref = db.collection(collection).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, error: 'הרשומה לא נמצאה' }
  const website = ((snap.data() as { websiteUrl?: string }).websiteUrl ?? '').trim()
  if (!website) return { ok: false, error: 'לא הוגדרה כתובת אתר' }
  if (!validateFetchUrl(website)) return { ok: false, error: 'כתובת האתר חייבת להתחיל ב-https:// ולהיות אתר ציבורי' }

  const logo = await findLogo(website)
  if (!logo) {
    if (recordFailure) await ref.update({ logoFetchFailedAt: FieldValue.serverTimestamp() }).catch(() => undefined)
    return { ok: false, error: 'לא נמצא לוגו באתר' }
  }

  const path = logoStoragePath(collection, id, logo.ext)
  const token = randomUUID()
  await getStorage().bucket(bucketName).file(path).save(Buffer.from(logo.bytes), {
    resumable: false,
    metadata: {
      contentType: logo.mime,
      cacheControl: 'public, max-age=86400',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  })
  const logoUrl = logoDownloadUrl(bucketName, path, token)
  await ref.update({ logoUrl, logoFetchedAt: FieldValue.serverTimestamp(), logoFetchFailedAt: FieldValue.delete() })
  return { ok: true, logoUrl }
}

async function processMissing(db: Firestore) {
  const todo: { collection: LogoCollection; id: string }[] = []
  for (const collection of COLLECTIONS) {
    const snap = await db.collection(collection).get()
    for (const d of snap.docs) {
      const x = d.data() as { websiteUrl?: string; logoUrl?: string; logoFetchFailedAt?: unknown; active?: boolean }
      if (x.websiteUrl && !x.logoUrl && !x.logoFetchFailedAt && x.active !== false) todo.push({ collection, id: d.id })
    }
  }
  const deadline = Date.now() + BULK_BUDGET_MS
  let next = 0
  let done = 0
  let failed = 0
  const worker = async () => {
    while (next < todo.length && Date.now() < deadline) {
      const item = todo[next++]
      const r = await processDoc(db, item.collection, item.id, true).catch(() => ({ ok: false as const, error: '' }))
      if (r.ok) done++
      else failed++
    }
  }
  await Promise.all(Array.from({ length: BULK_CONCURRENCY }, worker))
  return { done, failed, remaining: Math.max(0, todo.length - next) }
}

/** HQ only. POST { collection, id } for one organisation, or { all: true } for every one still without a logo. */
export const handler: Handler = async (event) => {
  const origin = event.headers['origin']
  const cors = corsHeaders(origin)
  if (event.httpMethod === 'OPTIONS') return handleOptions(origin)
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' }

  const reply = (statusCode: number, body: unknown) => ({
    statusCode, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  const authHeader = event.headers['authorization'] ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return reply(401, { ok: false, error: 'לא מחובר' })

  try { initFirebase() } catch { return reply(500, { ok: false, error: 'שגיאת הגדרות בשרת' }) }

  let uid: string
  try { uid = (await getAuth().verifyIdToken(idToken)).uid } catch { return reply(401, { ok: false, error: 'ההתחברות פגה, התחבר מחדש' }) }

  const db = getFirestore()
  const caller = (await db.collection('users').doc(uid).get()).data() as { active?: boolean; role?: string } | undefined
  if (!caller || caller.active === false || ['', 'coordinator', 'none'].includes(caller.role ?? '')) {
    return reply(403, { ok: false, error: 'אין הרשאה' })
  }

  let body: { collection?: unknown; id?: unknown; all?: unknown } = {}
  try { body = JSON.parse(event.body ?? '{}') } catch { return reply(400, { ok: false, error: 'בקשה לא תקינה' }) }

  try {
    if (body.all === true) return reply(200, { ok: true, ...(await processMissing(db)) })
    if (!isLogoCollection(body.collection) || !isValidDocId(body.id)) return reply(400, { ok: false, error: 'בקשה לא תקינה' })
    const result = await processDoc(db, body.collection, body.id, false)
    return reply(result.ok ? 200 : 422, result)
  } catch {
    return reply(500, { ok: false, error: 'משיכת הלוגו נכשלה' })
  }
}
