// ייבוא החומר הקיים מתוך האתר (במקום שורת פקודה): התאמת קבצים שהמשתמש בוחר לרשומות הקטלוג.
// אותה לוגיקת התאמה כמו בסקריפט scripts/import-archive.ts: לפי שם הקובץ (כולל שמות של עותקים זהים),
// ואם יש כמה קבצים באותו שם - לפי גודל.

import { emptyInput, type DocInput } from './model.ts'
import { MULTI_DIMS } from './taxonomy.ts'

export interface CatalogEntry {
  file: string
  size: number | null
  seq: number
  title: string
  folder: string
  docType: string
  status: string
  publisher: string
  forum: string[]
  dimension: string[]
  responsibility: string[]
  unit: string[]
  leg: string[]
  topic: string[]
  stakeholderCircle: string[]
  chapter: string[]
  meetingDate: string | null
  year: number | null
  summary: string
  author?: string
  restricted: boolean
  family: string | null
  versionLabel: string
  current: boolean
  needsReview: string | null
  duplicates: string[]
  rationale: string
  links: { type: string; targetFile: string }[]
}

export interface PickedFile {
  name: string
  size: number
}

export interface ImportPlan<F extends PickedFile> {
  matched: { entry: CatalogEntry; file: F }[]
  notFound: CatalogEntry[]
  unknown: F[]
}

const nfc = (s: string) => s.normalize('NFC')
/** שם הקובץ בלבד, גם כשהדפדפן מוסיף נתיב תיקייה (webkitRelativePath) */
export const baseName = (s: string) => nfc(s.split('/').pop() ?? s)

export function planImport<F extends PickedFile>(entries: CatalogEntry[], files: F[]): ImportPlan<F> {
  const byName = new Map<string, F[]>()
  for (const f of files) {
    const n = baseName(f.name)
    byName.set(n, [...(byName.get(n) ?? []), f])
  }
  const used = new Set<F>()
  const matched: { entry: CatalogEntry; file: F }[] = []
  const notFound: CatalogEntry[] = []
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
    const names = [nfc(e.file.split('#')[0]), ...e.duplicates.map(nfc)]
    let cands = names.flatMap((n) => byName.get(n) ?? []).filter((f) => !used.has(f))
    if (e.size) cands = cands.filter((f) => f.size === e.size)
    const pick = cands[0]
    if (!pick) {
      notFound.push(e)
      continue
    }
    used.add(pick)
    // עותקים זהים של אותו מסמך לא מיובאים שוב - מסמנים אותם כמטופלים
    for (const n of e.duplicates.map(nfc)) for (const f of byName.get(n) ?? []) if (f.size === pick.size) used.add(f)
    for (const f of byName.get(baseName(pick.name)) ?? []) if (f.size === pick.size) used.add(f)
    matched.push({ entry: e, file: pick })
  }
  const unknown = files.filter((f) => !used.has(f) && !baseName(f.name).startsWith('.'))
  return { matched, notFound, unknown }
}

/** מזהה מסמך קבוע לכל רשומת קטלוג - זהה לזה של סקריפט הייבוא, כך שהרצות חוזרות מתחברות */
export async function stableDocId(file: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nfc(file)))
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return 'imp' + hex.slice(0, 17)
}

/** הופך רשומת קטלוג לקלט מסמך. פריט שדורש אימות מקבל את ההערה בראש התקציר. */
export function entryToInput(e: CatalogEntry, idOf: (file: string) => string | undefined): DocInput {
  const input: DocInput = {
    ...emptyInput(),
    title: e.title,
    folder: e.folder,
    docType: e.docType,
    status: e.status,
    publisher: e.publisher,
    meetingDate: e.meetingDate,
    year: e.year,
    restricted: e.restricted,
    versionLabel: e.versionLabel,
    author: e.author ?? '',
    summary: [e.needsReview ? `⚠ לאימות: ${e.needsReview.replace(/^לאמת: /, '')}` : '', e.summary].filter(Boolean).join('\n').slice(0, 3000),
    links: e.links.flatMap((l) => {
      const to = idOf(l.targetFile)
      return to ? [{ type: l.type, to }] : []
    }),
  }
  for (const dim of MULTI_DIMS) input[dim] = (e as unknown as Record<string, string[]>)[dim] ?? []
  return input
}
