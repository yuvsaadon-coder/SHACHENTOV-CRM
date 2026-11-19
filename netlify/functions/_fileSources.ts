/**
 * Every file in the system, found by walking the collections that hold files. One entry per
 * distinct file, listing all the places it is attached.
 */
import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'

export interface Place { type: string; label: string; id: string }

export type FileKindOfSource = 'static' | 'storage' | 'data'

export interface FileEntry {
  key: string
  url: string
  name: string
  ext: string
  kind: FileKindOfSource
  places: Place[]
  /** Changes when the file behind the entry changes, so it is read again. */
  sourceHash: string
}

export interface LinkEntry { name: string; url: string; label: string }

export interface Sources { files: FileEntry[]; links: LinkEntry[]; warnings: string[] }

export const STORAGE_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com']
const STATIC_PREFIXES = ['/templates/', '/articles/']
const MAX_PLACES = 25

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** The site's own address, from Netlify's environment or the request. */
export function siteOriginOf(headers: Record<string, string | undefined>): string {
  const fromEnv = process.env.URL ?? process.env.DEPLOY_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return `https://${headers['x-forwarded-host'] ?? headers['host'] ?? 'localhost'}`
}

export interface Classified { kind: FileKindOfSource | 'link'; key: string; absolute: string }

/** What a stored url points at: a file of the site, a Storage file, inline data, or just a web link. */
export function classifyUrl(raw: string, siteOrigin: string): Classified {
  const url = raw.trim()
  if (url.startsWith('data:')) return { kind: 'data', key: `data:${sha256(url)}`, absolute: url }
  const siteHost = new URL(siteOrigin).host
  let parsed: URL
  try {
    parsed = new URL(url, siteOrigin)
  } catch {
    return { kind: 'link', key: `link:${url}`, absolute: url }
  }
  const sameSite = url.startsWith('/') || parsed.host === siteHost
  if (sameSite && STATIC_PREFIXES.some((p) => parsed.pathname.startsWith(p))) {
    return { kind: 'static', key: `static:${decodeURIComponent(parsed.pathname).replace(/^\//, '')}`, absolute: `${siteOrigin}${parsed.pathname}` }
  }
  if (parsed.protocol === 'https:' && STORAGE_HOSTS.includes(parsed.host)) {
    return { kind: 'storage', key: `url:${parsed.toString()}`, absolute: parsed.toString() }
  }
  return { kind: 'link', key: `link:${parsed.toString()}`, absolute: parsed.toString() }
}

export const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '')

function nameFromUrl(url: string): string {
  try {
    const last = new URL(url, 'https://x.invalid').pathname.split('/').pop() ?? ''
    return decodeURIComponent(last)
  } catch {
    return ''
  }
}

/** Collects entries by key, merging the places of the same file attached in several spots. */
export class SourceCollector {
  private files = new Map<string, FileEntry>()
  private links = new Map<string, LinkEntry>()
  private siteOrigin: string
  constructor(siteOrigin: string) { this.siteOrigin = siteOrigin }

  add(url: unknown, name: unknown, place: Place): void {
    if (typeof url !== 'string' || !url.trim()) return
    const c = classifyUrl(url, this.siteOrigin)
    const fileName = (typeof name === 'string' && name.trim() ? name.trim() : nameFromUrl(c.absolute)) || 'קובץ'
    if (c.kind === 'link') {
      if (!this.links.has(c.key)) this.links.set(c.key, { name: fileName, url: c.absolute, label: place.label })
      return
    }
    const existing = this.files.get(c.key)
    if (existing) {
      if (existing.places.length < MAX_PLACES && !existing.places.some((p) => p.type === place.type && p.id === place.id)) existing.places.push(place)
      return
    }
    this.files.set(c.key, {
      key: c.key, url: c.absolute, name: fileName, ext: extOf(fileName), kind: c.kind, places: [place],
      sourceHash: c.kind === 'storage' ? c.absolute : c.key,
    })
  }

  addLink(url: unknown, name: string, label: string): void {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return
    if (!this.links.has(`link:${url}`)) this.links.set(`link:${url}`, { name, url, label })
  }

  result(warnings: string[]): Sources {
    return { files: [...this.files.values()], links: [...this.links.values()], warnings }
  }
}

type Row = Record<string, unknown>

/** Walks every collection that can hold a file. A collection that cannot be read is reported, not fatal. */
export async function collectSources(db: Firestore, siteOrigin: string, staticFiles: string[]): Promise<Sources> {
  const c = new SourceCollector(siteOrigin)
  const warnings: string[] = []
  const guard = async (label: string, fn: () => Promise<void>) => {
    try { await fn() } catch (e) { warnings.push(`${label}: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const taskTitles = new Map<string, string>()
  await guard('tasks', async () => {
    const snap = await db.collection('tasks').select('title').get()
    for (const d of snap.docs) taskTitles.set(d.id, String((d.data() as Row).title ?? ''))
  })

  await Promise.all([
    guard('task attachments', async () => {
      const snap = await db.collectionGroup('attachments').get()
      for (const d of snap.docs) {
        const parts = d.ref.path.split('/')
        if (parts[0] !== 'tasks') continue
        const r = d.data() as Row
        const taskId = parts[1]
        c.add(r.storageUrl, r.fileName, { type: 'task', id: taskId, label: `משימה ${taskId}: ${taskTitles.get(taskId) ?? ''}`.trim() })
      }
    }),
    guard('hq_knowledge', async () => {
      const snap = await db.collection('hq_knowledge').get()
      for (const d of snap.docs) {
        const r = d.data() as Row
        c.add(r.fileUrl, r.fileName, { type: 'hq_knowledge', id: d.id, label: `מאגר ידע מטה: ${r.title ?? ''}` })
      }
    }),
    guard('hq_finance', async () => {
      const snap = await db.collection('hq_finance').get()
      for (const d of snap.docs) {
        const r = d.data() as Row
        c.add(r.fileUrl, r.fileName, { type: 'hq_finance', id: d.id, label: `דוחות כספיים: ${r.title ?? ''}${r.period ? ` (${r.period})` : ''}` })
      }
    }),
    guard('hq_official_docs', async () => {
      const labels: Record<string, string> = { registration: 'תעודת רישום עמותה', section46: 'אישור סעיף 46', approval: 'אישור ניהול תקין' }
      const snap = await db.collection('hq_official_docs').get()
      for (const d of snap.docs) {
        const r = d.data() as Row
        c.add(r.fileUrl, r.fileName, { type: 'hq_official_docs', id: d.id, label: `טפסים רשמיים: ${labels[String(r.subtype)] ?? r.subtype ?? ''}${r.year ? ` ${r.year}` : ''}` })
      }
    }),
    guard('hq_partners', async () => {
      const snap = await db.collection('hq_partners').get()
      for (const d of snap.docs) {
        const r = d.data() as Row
        for (const f of Array.isArray(r.files) ? (r.files as Row[]) : []) c.add(f.url, f.name, { type: 'hq_partners', id: d.id, label: `שותף: ${r.name ?? ''}` })
      }
    }),
    guard('hq_suppliers', async () => {
      const snap = await db.collection('hq_suppliers').get()
      for (const d of snap.docs) {
        const r = d.data() as Row
        for (const f of Array.isArray(r.files) ? (r.files as Row[]) : []) c.add(f.url, f.name, { type: 'hq_suppliers', id: d.id, label: `ספק: ${r.name ?? ''}` })
      }
    }),
    guard('knowledge_articles', async () => {
      const snap = await db.collection('knowledge_articles').get()
      for (const d of snap.docs) {
        const r = d.data() as Row
        c.add(r.storageUrl, `${r.titleHe ?? d.id}.pdf`, { type: 'knowledge_articles', id: d.id, label: `ספריית מחקר: ${r.titleHe ?? d.id}` })
      }
    }),
    guard('knowledgeItems', async () => {
      const snap = await db.collection('knowledgeItems').get()
      for (const d of snap.docs) {
        const r = d.data() as Row
        c.add(r.fileUrl, r.fileName, { type: 'knowledgeItems', id: d.id, label: `ידע: ${r.title ?? ''}` })
      }
    }),
    guard('hq_drive_links', async () => {
      const snap = await db.collection('hq_drive_links').get()
      for (const d of snap.docs) {
        const r = d.data() as Row
        c.addLink(r.url, String(r.name ?? ''), 'מסמכי דרייב')
      }
    }),
  ])

  for (const path of staticFiles) {
    const label = path.startsWith('articles/') ? 'ספריית מחקר (קבצים)' : 'תבניות ומסמכי מערכת'
    c.add(`/${path}`, nameFromUrl(path), { type: 'static', id: path, label })
  }
  return c.result(warnings)
}
