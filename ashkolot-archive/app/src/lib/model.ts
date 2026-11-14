import { MULTI_DIMS, SINGLE_DIMS, type MultiDim, type Taxonomy } from './taxonomy.ts'

export type Role = 'admin' | 'editor' | 'viewer'

export interface AppUser {
  email: string
  role: Role
  active: boolean
  name?: string
}

export interface DocLink {
  type: string
  to: string
}

export interface FileMeta {
  path: string
  name: string
  size: number
  contentType: string
  sha256: string
}

/** השדות שמשתמש עורך - משותפים להעלאה, לעריכה ולכרטיס התיוק של הסקיל */
export interface DocInput {
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
  /** מחבר/ת המסמך (Dublin Core: creator) - שונה מהמעלה/ה */
  author: string
  restricted: boolean
  versionLabel: string
  links: DocLink[]
}

export interface ArchiveDoc extends DocInput {
  id: string
  /** מספר רץ קבוע שמוקצה ביצירה ולא משתנה בתיוק מחדש (ISO 15489: מזהה ייחודי וקבוע) */
  seq: number
  familyId: string
  isCurrent: boolean
  archived: boolean
  linkTargets: string[]
  file: FileMeta | null
  originalName: string
  createdBy: string
  createdAt: Date | null
  updatedBy: string
  updatedAt: Date | null
  rev: number
}

export interface HistoryEntry {
  rev: number
  by: string
  at: Date | null
  action: 'create' | 'update' | 'archive' | 'restore' | 'new-version' | 'superseded'
  changes: Record<string, { from: unknown; to: unknown }>
}

export const LIMITS = {
  title: 300,
  summary: 3000,
  author: 200,
  versionLabel: 40,
  links: 50,
  multi: 24,
  fileBytes: 100 * 1024 * 1024,
} as const

/** סוגי קבצים מותרים להעלאה - נאכף גם בכללי Storage */
export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
] as const

const EXT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

/** קובע את סוג התוכן לפי הסיומת (דפדפנים לפעמים מחזירים סוג ריק לקבצי Office) */
export function contentTypeFor(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TYPES[ext] ?? null
}

/** שם קובץ בטוח לנתיב אחסון: בלי לוכסנים, תווי בקרה או נקודות מובילות. שומר עברית. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|#[\]]/g, '_')
    .replace(/^\.+/, '')
    .trim()
  const trimmed = cleaned.length > 150 ? cleaned.slice(0, 120) + cleaned.slice(cleaned.lastIndexOf('.')) : cleaned
  return trimmed || 'file'
}

export function emptyInput(): DocInput {
  return {
    title: '',
    folder: '',
    docType: '',
    status: 'draft',
    publisher: 'program',
    forum: [],
    dimension: [],
    responsibility: [],
    unit: [],
    leg: [],
    topic: [],
    stakeholderCircle: [],
    chapter: [],
    meetingDate: null,
    year: null,
    summary: '',
    author: '',
    restricted: false,
    versionLabel: '',
    links: [],
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** מאמת קלט מסמך מול הטקסונומיה. מחזיר רשימת שגיאות בעברית (ריקה = תקין). אותם תנאים נאכפים בכללי Firestore. */
export function validateInput(input: DocInput, tax: Taxonomy): string[] {
  const errors: string[] = []
  const title = input.title.trim()
  if (!title) errors.push('חסרה כותרת')
  if (title.length > LIMITS.title) errors.push(`הכותרת ארוכה מ-${LIMITS.title} תווים`)
  if (!tax.folders.some((f) => f.key === input.folder)) errors.push('יש לבחור תיקייה')
  for (const dim of SINGLE_DIMS) {
    const def = tax.dimensions[dim]
    const val = input[dim]
    if (!def?.values.some((v) => v.key === val)) errors.push(`יש לבחור ${def?.label ?? dim}`)
  }
  for (const dim of MULTI_DIMS) {
    const def = tax.dimensions[dim]
    const vals = input[dim]
    if (!Array.isArray(vals)) {
      errors.push(`${def?.label ?? dim}: ערך לא תקין`)
      continue
    }
    if (vals.length > LIMITS.multi) errors.push(`${def?.label ?? dim}: יותר מדי ערכים`)
    const bad = vals.filter((v) => !def?.values.some((x) => x.key === v))
    if (bad.length) errors.push(`${def?.label ?? dim}: ערכים לא מוכרים - ${bad.join(', ')}`)
  }
  if (input.meetingDate !== null && !DATE_RE.test(input.meetingDate)) errors.push('תאריך מפגש בפורמט YYYY-MM-DD')
  if (input.folder === '09' && !input.meetingDate) errors.push('מסמך בתיקיית מפגשים חייב תאריך מפגש')
  if (input.folder === '09' && input.forum.length === 0) errors.push('מסמך בתיקיית מפגשים חייב פורום')
  if (input.year !== null && (!Number.isInteger(input.year) || input.year < 1990 || input.year > 2100)) errors.push('שנה לא תקינה')
  if (input.summary.length > LIMITS.summary) errors.push(`התקציר ארוך מ-${LIMITS.summary} תווים`)
  if (input.author.length > LIMITS.author) errors.push('שדה המחבר/ת ארוך מדי')
  if (input.versionLabel.length > LIMITS.versionLabel) errors.push('תווית הגרסה ארוכה מדי')
  if (input.links.length > LIMITS.links) errors.push('יותר מדי קישורים')
  for (const l of input.links) {
    if (!tax.linkTypes.some((t) => t.key === l.type)) errors.push(`סוג קישור לא מוכר: ${l.type}`)
    if (!l.to) errors.push('קישור בלי מסמך יעד')
  }
  return errors
}

/** מנרמל קלט לפני שמירה: חיתוך רווחים, הסרת כפילויות ומיון כדי שההשוואה בין גרסאות תהיה יציבה */
export function normalizeInput(input: DocInput): DocInput {
  const uniq = (a: string[]) => [...new Set(a)].sort()
  const out: DocInput = { ...input, title: input.title.trim(), summary: input.summary.trim(), author: (input.author ?? '').trim(), versionLabel: input.versionLabel.trim() }
  for (const dim of MULTI_DIMS) out[dim as MultiDim] = uniq(input[dim as MultiDim])
  const seen = new Set<string>()
  out.links = input.links.filter((l) => {
    const k = `${l.type}|${l.to}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return out
}

export const INPUT_FIELDS: (keyof DocInput)[] = [
  'title', 'folder', 'docType', 'status', 'publisher', ...MULTI_DIMS,
  'meetingDate', 'year', 'summary', 'author', 'restricted', 'versionLabel', 'links',
]

export const CODE_PREFIX = 'AK'

/** מזהה תצוגה קבוע: AK-007. מופיע באתר, בשם הקובץ בהורדה, בקטלוג ובכרטיסי התיוק. */
export function docCode(seq: number | null | undefined): string {
  return seq ? `${CODE_PREFIX}-${String(seq).padStart(3, '0')}` : ''
}

const CODE_RE = new RegExp(`^${CODE_PREFIX}-?0*(\\d+)$`, 'i')
export function parseCode(s: string): number | null {
  const m = s.trim().match(CODE_RE)
  return m ? Number(m[1]) : null
}

/** שם קובץ אחיד בהורדה: "AK-007 כותרת.pdf" */
export function downloadName(d: { seq: number; title: string; file: FileMeta | null }): string {
  const ext = d.file?.name.includes('.') ? d.file.name.slice(d.file.name.lastIndexOf('.')) : ''
  return safeFileName(`${docCode(d.seq)} ${d.title}`.slice(0, 140) + ext)
}

/** מחשב את ההבדלים בין שני מצבים של מסמך - נשמר ביומן ההיסטוריה */
export function diffInputs(before: Partial<DocInput>, after: Partial<DocInput>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const f of INPUT_FIELDS) {
    const a = JSON.stringify(before[f] ?? null)
    const b = JSON.stringify(after[f] ?? null)
    if (a !== b) changes[f] = { from: before[f] ?? null, to: after[f] ?? null }
  }
  return changes
}

export function pickInput(doc: ArchiveDoc | DocInput): DocInput {
  const out = {} as Record<string, unknown>
  for (const f of INPUT_FIELDS) out[f] = (doc as unknown as Record<string, unknown>)[f]
  return out as unknown as DocInput
}

/** מי רשאי לראות מסמך מוגבל ("לא להפצה") */
export function canSeeRestricted(role: Role): boolean {
  return role === 'admin' || role === 'editor'
}

export function canEdit(role: Role): boolean {
  return role === 'admin' || role === 'editor'
}
