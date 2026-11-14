// סינון וחיפוש בצד הלקוח. בהיקף של מאות מסמכים זה מהיר יותר ופשוט יותר מאינדקס חיפוש בשרת.

import type { ArchiveDoc } from './model.ts'
import { normalizeTitle } from './card.ts'
import { MULTI_DIMS, SINGLE_DIMS, valueLabel, folderLabel, type Taxonomy } from './taxonomy.ts'

export interface Filters {
  text: string
  folder: string | null
  /** לכל ציר: הערכים שנבחרו. בתוך ציר - "או"; בין צירים - "וגם". */
  tags: Record<string, string[]>
  showOldVersions: boolean
  showArchived: boolean
}

export function emptyFilters(): Filters {
  return { text: '', folder: null, tags: {}, showOldVersions: false, showArchived: false }
}

/** טקסט חיפוש מלא למסמך: כותרת, תקציר, שם קובץ ותוויות התגיות (כדי שחיפוש "רווחה" ימצא גם לפי תגית) */
export function searchableText(doc: ArchiveDoc, tax: Taxonomy): string {
  const parts = [doc.title, doc.summary, doc.originalName, doc.versionLabel, folderLabel(tax, doc.folder)]
  for (const dim of [...MULTI_DIMS, ...SINGLE_DIMS]) {
    const v = doc[dim]
    for (const k of Array.isArray(v) ? v : [v]) parts.push(valueLabel(tax, dim, k))
  }
  return normalizeTitle(parts.join(' '))
}

export function matchesFilters(doc: ArchiveDoc, f: Filters, tax: Taxonomy, textIndex?: string): boolean {
  if (!f.showArchived && doc.archived) return false
  if (!f.showOldVersions && !doc.isCurrent) return false
  if (f.folder) {
    // בחירה בתיקיית-אב "02" כוללת את כל תתי-התיקיות שלה
    if (!(doc.folder === f.folder || doc.folder.startsWith(f.folder + '-'))) return false
  }
  for (const [dim, wanted] of Object.entries(f.tags)) {
    if (!wanted.length) continue
    const v = (doc as unknown as Record<string, unknown>)[dim]
    const have = Array.isArray(v) ? (v as string[]) : [v as string]
    if (!wanted.some((w) => have.includes(w))) return false
  }
  const q = normalizeTitle(f.text)
  if (q) {
    const hay = textIndex ?? searchableText(doc, tax)
    if (!q.split(' ').every((term) => hay.includes(term))) return false
  }
  return true
}

export function filterDocs(docs: ArchiveDoc[], f: Filters, tax: Taxonomy): ArchiveDoc[] {
  return docs
    .filter((d) => matchesFilters(d, f, tax))
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
}

/** ספירת מסמכים לכל תיקייה (מסמכים נוכחיים ולא בארכיון) - לעץ התיקיות */
export function folderCounts(docs: ArchiveDoc[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const d of docs) {
    if (d.archived || !d.isCurrent) continue
    counts[d.folder] = (counts[d.folder] ?? 0) + 1
    const parent = d.folder.split('-')[0]
    if (parent !== d.folder) counts[parent] = (counts[parent] ?? 0) + 1
  }
  return counts
}

/** כל הגרסאות של משפחת מסמכים, מהחדשה לישנה */
export function familyOf(docs: ArchiveDoc[], familyId: string): ArchiveDoc[] {
  return docs
    .filter((d) => d.familyId === familyId)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
}

/** קישורים נכנסים: מסמכים אחרים שמצביעים על המסמך הזה */
export function backlinks(docs: ArchiveDoc[], id: string): { doc: ArchiveDoc; type: string }[] {
  const out: { doc: ArchiveDoc; type: string }[] = []
  for (const d of docs) for (const l of d.links) if (l.to === id) out.push({ doc: d, type: l.type })
  return out
}

/** ייצוא CSV של הקטלוג (לגיבוי ולעבודה באקסל). מוגן מפני הזרקת נוסחאות. */
export function toCsv(docs: ArchiveDoc[], tax: Taxonomy): string {
  const cols: [string, (d: ArchiveDoc) => string][] = [
    ['מזהה', (d) => d.id],
    ['כותרת', (d) => d.title],
    ['תיקייה', (d) => folderLabel(tax, d.folder)],
    ['סוג', (d) => valueLabel(tax, 'docType', d.docType)],
    ['סטטוס', (d) => valueLabel(tax, 'status', d.status)],
    ['גוף מפרסם', (d) => valueLabel(tax, 'publisher', d.publisher)],
    ...MULTI_DIMS.map((dim) => [tax.dimensions[dim]?.label ?? dim, (d: ArchiveDoc) => d[dim].map((k) => valueLabel(tax, dim, k)).join('; ')] as [string, (d: ArchiveDoc) => string]),
    ['תאריך מפגש', (d) => d.meetingDate ?? ''],
    ['שנה', (d) => (d.year ? String(d.year) : '')],
    ['גרסה', (d) => d.versionLabel],
    ['גרסה נוכחית', (d) => (d.isCurrent ? 'כן' : 'לא')],
    ['לא להפצה', (d) => (d.restricted ? 'כן' : 'לא')],
    ['בארכיון', (d) => (d.archived ? 'כן' : 'לא')],
    ['תקציר', (d) => d.summary],
    ['שם קובץ מקורי', (d) => d.originalName],
    ['עודכן ע"י', (d) => d.updatedBy],
    ['עודכן', (d) => d.updatedAt?.toISOString() ?? ''],
  ]
  const esc = (v: string) => {
    let s = v ?? ''
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.map((c) => esc(c[0])).join(',')]
  for (const d of docs) lines.push(cols.map((c) => esc(c[1](d))).join(','))
  return '﻿' + lines.join('\r\n')
}
