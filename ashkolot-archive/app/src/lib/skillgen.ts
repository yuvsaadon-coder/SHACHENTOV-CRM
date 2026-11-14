// מייצר את קובצי הייחוס של הסקיל מתוך הטקסונומיה החיה והקטלוג.
// משמש גם את סקריפט הבנייה (node) וגם את כפתור "הורדת סקיל מעודכן" במסך הניהול,
// כך שהסקיל שמופץ לצוות תמיד תואם למבנה התיוק הנוכחי.

import { zipSync, strToU8 } from 'fflate'
import { folderLabel, isActive, valueLabel, type Taxonomy } from './taxonomy.ts'

export interface CatalogEntry {
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
  out.push('## תיקיות (שדה `folder`, ערך אחד בלבד)', '', '| מפתח | תיקייה | מה נכנס |', '|---|---|---|')
  for (const f of tax.folders.filter(isActive)) out.push(`| \`${f.key}\` | ${mdEscape(f.label)} | ${mdEscape(f.hint ?? '')} |`)
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
  out.push('השתמש בכותרת המדויקת מכאן בשדות `versionOf` ו-`links[].target`. מסמכים שנוספו אחרי התאריך הזה לא מופיעים - שאל את המשתמש.', '')
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
      out.push(`- ${e.title}${meta ? ` — ${meta}` : ''}`)
    }
    out.push('')
  }
  if (!entries.length) out.push('_הארכיון עדיין ריק._', '')
  return out.join('\n')
}

/** בונה את קובץ ה-zip של הסקיל (מבנה תיקייה כפי ש-Claude מצפה: ashkolot-filing/SKILL.md + references/) */
export function buildSkillZip(skillMd: string, tax: Taxonomy, entries: CatalogEntry[], now = new Date()): Uint8Array {
  return zipSync({
    'ashkolot-filing/SKILL.md': strToU8(skillMd),
    'ashkolot-filing/references/taxonomy.md': strToU8(taxonomyMarkdown(tax)),
    'ashkolot-filing/references/catalog.md': strToU8(catalogMarkdown(tax, entries, now)),
  })
}
