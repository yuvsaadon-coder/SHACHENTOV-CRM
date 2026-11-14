// בונה את קובץ הסקיל להפצה מתוך taxonomy.json ו-seed/catalog.json (לפני שהאפליקציה עולה).
// אחרי שהארכיון פעיל - עדיף להוריד את הסקיל ממסך הניהול, כדי שיכלול את המצב העדכני.
// הרצה: npm run skill   →   ../dist/ashkolot-filing.zip

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { buildSkillZip, type CatalogEntry } from '../src/lib/skillgen.ts'
import type { Taxonomy } from '../src/lib/taxonomy.ts'

const root = new URL('../../', import.meta.url)
const tax = JSON.parse(readFileSync(new URL('taxonomy/taxonomy.json', root), 'utf8')) as Taxonomy
const skillMd = readFileSync(new URL('skill/ashkolot-filing/SKILL.md', root), 'utf8')
const catalog = JSON.parse(readFileSync(new URL('seed/catalog.json', root), 'utf8')) as {
  entries: (CatalogEntry & { current: boolean; restricted: boolean })[]
}

const entries = catalog.entries.filter((e) => e.current && !e.restricted)
const zip = buildSkillZip(skillMd, tax, entries)
mkdirSync(new URL('dist/', root), { recursive: true })
const out = new URL('dist/ashkolot-filing.zip', root)
writeFileSync(out, zip)
console.log(`נבנה ${out.pathname} (${entries.length} מסמכים בקטלוג, ${zip.length} בתים)`)
