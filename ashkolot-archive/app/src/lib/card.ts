// כרטיס תיוק: הפלט של סקיל התיוק. המשתמש מדביק אותו במסך ההעלאה (או בעריכה) והטופס מתמלא.
// הכרטיס הוא קלט לא מהימן - כל ערך נבדק מול הטקסונומיה, וערך לא מוכר נזרק עם אזהרה.

import { emptyInput, type DocInput } from './model.ts'
import { MULTI_DIMS, SINGLE_DIMS, type Taxonomy } from './taxonomy.ts'

export const CARD_MARKER = 'ashkolot_card'
export const CARD_VERSION = 1

export interface PendingLink {
  type: string
  target: string
}

export interface ParsedCard {
  input: DocInput
  pendingLinks: PendingLink[]
  versionOf: string | null
  originalName: string | null
  warnings: string[]
}

const MAX_CARD_CHARS = 20000

/** מחלץ את אובייקט ה-JSON מטקסט מודבק (גם אם הוא עטוף בבלוק קוד או בטקסט נוסף) */
export function extractCardJson(text: string): unknown {
  if (text.length > MAX_CARD_CHARS) throw new Error('הטקסט ארוך מדי לכרטיס תיוק')
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('לא נמצא כרטיס תיוק בטקסט')
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    throw new Error('כרטיס התיוק אינו JSON תקין')
  }
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function parseCard(text: string, tax: Taxonomy): ParsedCard {
  const raw = extractCardJson(text)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('כרטיס התיוק אינו אובייקט')
  const c = raw as Record<string, unknown>
  if (!(CARD_MARKER in c)) throw new Error('זה לא כרטיס תיוק של ארכיון אשכולות (חסר השדה ashkolot_card)')

  const warnings: string[] = []
  const input = emptyInput()
  input.title = str(c.title, 300)
  input.summary = str(c.summary, 3000)
  input.versionLabel = str(c.versionLabel, 40)
  input.restricted = c.restricted === true

  const folder = str(c.folder, 10)
  if (tax.folders.some((f) => f.key === folder)) input.folder = folder
  else if (folder) warnings.push(`תיקייה לא מוכרת "${folder}" - יש לבחור ידנית`)

  for (const dim of SINGLE_DIMS) {
    const v = str(c[dim], 40)
    if (!v) continue
    if (tax.dimensions[dim]?.values.some((x) => x.key === v)) input[dim] = v
    else warnings.push(`${tax.dimensions[dim]?.label ?? dim}: ערך לא מוכר "${v}"`)
  }

  for (const dim of MULTI_DIMS) {
    const vals = Array.isArray(c[dim]) ? (c[dim] as unknown[]) : []
    const def = tax.dimensions[dim]
    for (const v of vals) {
      if (typeof v !== 'string') continue
      if (def?.values.some((x) => x.key === v)) input[dim].push(v)
      else warnings.push(`${def?.label ?? dim}: ערך לא מוכר "${v}" הושמט`)
    }
  }

  const md = str(c.meetingDate, 10)
  if (md) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(md)) input.meetingDate = md
    else warnings.push(`תאריך מפגש לא תקין "${md}"`)
  }
  if (typeof c.year === 'number' && Number.isInteger(c.year) && c.year >= 1990 && c.year <= 2100) input.year = c.year

  const pendingLinks: PendingLink[] = []
  if (Array.isArray(c.links)) {
    for (const l of c.links.slice(0, 50)) {
      if (!l || typeof l !== 'object') continue
      const type = str((l as Record<string, unknown>).type, 40)
      const target = str((l as Record<string, unknown>).target, 300)
      if (!target) continue
      if (!tax.linkTypes.some((t) => t.key === type)) {
        warnings.push(`סוג קישור לא מוכר "${type}" - הוחלף ב"קשור ל"`)
        pendingLinks.push({ type: 'related', target })
      } else pendingLinks.push({ type, target })
    }
  }

  const versionOf = str(c.versionOf, 300) || null
  const originalName = str(c.originalName, 300) || null
  return { input, pendingLinks, versionOf, originalName, warnings }
}

// ---------- התאמת כותרות (לקישורים ולגרסאות שהסקיל מציין לפי שם) ----------

export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[֑-ׇ]/g, '') // ניקוד וטעמים
    .replace(/\.(pdf|docx?|pptx?|xlsx?|csv|txt)$/i, '')
    .replace(/["'`׳״“”‘’]/g, '')
    .replace(/[_\-–—.,:;()[\]{}|/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function tokens(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(' ').filter((t) => t.length > 1))
}

/** ציון דמיון 0..1 בין שתי כותרות */
export function titleScore(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = tokens(a)
  const tb = tokens(b)
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = ta.size + tb.size - inter
  const jaccard = union ? inter / union : 0
  const contains = na.includes(nb) || nb.includes(na) ? 0.3 : 0
  return Math.min(0.99, jaccard + contains)
}

export function bestMatches<T extends { id: string; title: string; originalName?: string }>(
  query: string,
  docs: T[],
  limit = 5,
  minScore = 0.2,
): { doc: T; score: number }[] {
  return docs
    .map((doc) => ({ doc, score: Math.max(titleScore(query, doc.title), doc.originalName ? titleScore(query, doc.originalName) : 0) }))
    .filter((m) => m.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
}
