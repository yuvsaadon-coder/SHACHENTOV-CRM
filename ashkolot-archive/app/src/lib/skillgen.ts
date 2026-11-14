// מייצר את קובצי הייחוס של הסקיל מתוך הטקסונומיה החיה והקטלוג.
// משמש גם את סקריפט הבנייה (node) וגם את כפתור "הורדת סקיל מעודכן" במסך הניהול,
// כך שהסקיל שמופץ לצוות תמיד תואם למבנה התיוק הנוכחי.

import { zipSync, strToU8 } from 'fflate'
import { folderLabel, isActive, valueLabel, type Taxonomy } from './taxonomy.ts'
import { docCode } from './model.ts'

export interface CatalogEntry {
  seq?: number
  rationale?: string
  title: string
  folder: string
  docType: string
  year: number | null
  versionLabel: string
  forum: string[]
}

const mdEscape = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function taxonomyMarkdown(tax: Taxonomy): string {
  const out: string[] = []
  out.push('# מבנה התיוק - ארכיון אשכולות העשור הבא', '')
  out.push(`גרסת טקסונומיה: ${tax.version}. השתמש **רק** במפתחות שבעמודה "מפתח".`, '')
  out.push('## תיקיות (שדה `folder`, ערך אחד בלבד)', '', '| מפתח | תיקייה | כולל | לא כולל (ולאן כן) |', '|---|---|---|---|')
  for (const f of tax.folders.filter(isActive)) out.push(`| \`${f.key}\` | ${mdEscape(f.label)} | ${mdEscape(f.hint ?? '')} | ${mdEscape(f.exclude ?? '')} |`)
  out.push('')
  for (const [dim, def] of Object.entries(tax.dimensions)) {
    const active = def.values.filter(isActive)
    if (!active.length) continue
    out.push(`## ${def.label} (שדה \`${dim}\`${def.multi ? ', רשימה - אפשר כמה ערכים' : ', ערך אחד'})`, '', '| מפתח | ערך | הערה |', '|---|---|---|')
    for (const v of active) out.push(`| \`${v.key}\` | ${mdEscape(v.label)} | ${mdEscape(v.note ?? v.hint ?? '')} |`)
    out.push('')
  }
  out.push('## סוגי קישור (שדה `links[].type`)', '', '| מפתח | משמעות |', '|---|---|')
  for (const l of tax.linkTypes.filter((x) => (x as { active?: boolean }).active !== false)) out.push(`| \`${l.key}\` | ${mdEscape(l.label)} |`)
  out.push('')
  return out.join('\n')
}

export function catalogMarkdown(tax: Taxonomy, entries: CatalogEntry[], generatedAt: Date): string {
  const out: string[] = []
  out.push('# קטלוג המסמכים בארכיון', '')
  out.push(`תמונת מצב מ-${generatedAt.toISOString().slice(0, 10)}. כולל רק גרסאות נוכחיות שאינן מוגבלות להפצה.`)
  out.push('בשדות `versionOf` ו-`links[].target` כתוב את **המזהה** (למשל `AK-012`) - זו ההתאמה המדויקת ביותר. אם אין מזהה, כתוב את הכותרת המדויקת. מסמכים שנוספו אחרי התאריך הזה לא מופיעים - שאל את המשתמש.', '')
  const byFolder = new Map<string, CatalogEntry[]>()
  for (const e of entries) {
    const list = byFolder.get(e.folder) ?? []
    list.push(e)
    byFolder.set(e.folder, list)
  }
  for (const f of tax.folders) {
    const list = byFolder.get(f.key)
    if (!list?.length) continue
    out.push(`## ${f.key} ${folderLabel(tax, f.key)}`, '')
    for (const e of list.sort((a, b) => a.title.localeCompare(b.title, 'he'))) {
      const meta = [valueLabel(tax, 'docType', e.docType), e.year ? String(e.year) : '', e.versionLabel, e.forum.map((k) => valueLabel(tax, 'forum', k)).join(', ')]
        .filter(Boolean)
        .join(' · ')
      out.push(`- ${e.seq ? `\`${docCode(e.seq)}\` ` : ''}${e.title}${meta ? ` — ${meta}` : ''}`)
    }
    out.push('')
  }
  if (!entries.length) out.push('_הארכיון עדיין ריק._', '')
  return out.join('\n')
}

/** תקדימים: איך מופה החומר הקיים, עם נימוק לכל מסמך - כדי שמסמכים דומים יתויקו באותו אופן */
export function precedentsMarkdown(tax: Taxonomy, entries: (CatalogEntry & { rationale?: string })[]): string {
  const out = ['# תקדימי מיפוי', '', 'כך מופה החומר הקיים של התוכנית. לכל מסמך: התיקייה והנימוק לפי כללי המיפוי. מסמך חדש מאותו סוג ואותו גוף מתייקים באותו אופן.', '']
  for (const f of tax.folders) {
    const list = entries.filter((e) => e.folder === f.key && e.rationale)
    if (!list.length) continue
    out.push(`## ${f.key} ${folderLabel(tax, f.key)}`, '')
    for (const e of list) out.push(`- ${e.seq ? `\`${docCode(e.seq)}\` ` : ''}${e.title}  \n  נימוק: ${e.rationale}`)
    out.push('')
  }
  return out.join('\n')
}

export interface SkillSources {
  skillMd: string
  mappingMd: string
  precedents: (CatalogEntry & { rationale?: string })[]
}

/** בונה את קובץ ה-zip של הסקיל (מבנה תיקייה כפי ש-Claude מצפה: ashkolot-filing/SKILL.md + references/) */
export function buildSkillZip(src: SkillSources, tax: Taxonomy, entries: CatalogEntry[], now = new Date()): Uint8Array {
  return zipSync({
    'ashkolot-filing/SKILL.md': strToU8(src.skillMd),
    'ashkolot-filing/references/mapping-rules.md': strToU8(src.mappingMd),
    'ashkolot-filing/references/precedents.md': strToU8(precedentsMarkdown(tax, src.precedents)),
    'ashkolot-filing/references/taxonomy.md': strToU8(taxonomyMarkdown(tax)),
    'ashkolot-filing/references/catalog.md': strToU8(catalogMarkdown(tax, entries, now)),
  })
}
