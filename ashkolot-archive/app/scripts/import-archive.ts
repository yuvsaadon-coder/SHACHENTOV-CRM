// ייבוא החומר הקיים לארכיון לפי seed/catalog.json.
//
// הכנה: מורידים את תיקיית ה-Drive כ-zip ופורסים אותה לתיקייה מקומית. סיכומי המפגשים שלא נמצאים
// ב-Drive מעתיקים לאותה תיקייה.
// הרצה (קודם יבש!):
//   npm run import-archive -- --project <id> --dir ~/Downloads/ashkolot --as you@example.org --dry-run
//   npm run import-archive -- --project <id> --dir ~/Downloads/ashkolot --as you@example.org
//
// מה הסקריפט עושה:
//  • מאתר כל קובץ מהקטלוג בתיקייה (לפי שם, ואם יש כמה - לפי גודל)
//  • מדלג על קבצים שכבר בארכיון (לפי SHA-256), כך שאפשר להריץ שוב בבטחה
//  • מעלה ל-Storage ויוצר רשומה + רשומת היסטוריה, באותו מבנה שהאפליקציה יוצרת
//  • מחבר גרסאות (family) וקישורים בין המסמכים
//  • מדווח על קבצים בתיקייה שלא מופיעים בקטלוג - אותם מתייקים דרך הסקיל
//  • פריטים שדורשים אימות מקבלים בתקציר את הסימון "⚠ לאימות:" - אפשר לחפש אותו באפליקציה

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { FieldValue } from 'firebase-admin/firestore'
import { arg, flag, initAdmin } from './admin-init.ts'
import { contentTypeFor, diffInputs, emptyInput, normalizeInput, safeFileName, validateInput, type DocInput } from '../src/lib/model.ts'
import { computeKeys, type Taxonomy } from '../src/lib/taxonomy.ts'
import { MULTI_DIMS } from '../src/lib/taxonomy.ts'

interface Entry extends Omit<DocInput, 'links' | 'versionLabel'> {
  file: string
  size: number | null
  family: string | null
  versionLabel: string
  current: boolean
  needsReview: string | null
  duplicates: string[]
  links: { type: string; targetFile: string }[]
}

const dir = arg('dir')
const asEmail = arg('as')?.toLowerCase()
const dry = flag('dry-run')
if (!dir || !asEmail) {
  console.error('שימוש: npm run import-archive -- --project <id> --dir <תיקייה> --as <מייל מנהל/ת> [--dry-run] [--catalog <path>]')
  process.exit(1)
}

const catalogPath = arg('catalog') ?? new URL('../../seed/catalog.json', import.meta.url).pathname
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { entries: Entry[] }
const tax = JSON.parse(readFileSync(new URL('../../taxonomy/taxonomy.json', import.meta.url), 'utf8')) as Taxonomy
tax.keys = computeKeys(tax)

// ---------- איתור קבצים מקומיים ----------
function walk(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
}
const local = walk(dir).filter((p) => !basename(p).startsWith('.'))
const byName = new Map<string, string[]>()
for (const p of local) {
  const n = basename(p).normalize('NFC')
  byName.set(n, [...(byName.get(n) ?? []), p])
}
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

function locate(e: Entry): string | null {
  const name = e.file.split('#')[0].normalize('NFC')
  const cands = [name, ...e.duplicates.map((x) => x.normalize('NFC'))].flatMap((n) => byName.get(n) ?? [])
  if (!cands.length) return null
  if (e.size) return cands.find((p) => statSync(p).size === e.size) ?? null
  return cands[0]
}

// ---------- תכנון ----------
const { db, bucket } = dry && !process.env.GOOGLE_APPLICATION_CREDENTIALS ? { db: null, bucket: null } : initAdmin()

const existingShas = new Set<string>()
if (db) for (const s of (await db.collection('documents').get()).docs) if (s.data().file?.sha256) existingShas.add(s.data().file.sha256)

// מזהים קבועים לכל רשומת קטלוג: הרצה חוזרת (למשל אחרי שנוספו קבצים מה-Drive) מחברת קישורים
// ומשפחות גרסאות לרשומות שכבר יובאו, במקום ליצור מזהים חדשים.
const stableId = (file: string) => 'imp' + createHash('sha256').update(file.normalize('NFC')).digest('hex').slice(0, 17)
const ids = new Map<string, string>()
for (const e of catalog.entries) ids.set(e.file, stableId(e.file))
const existingIds = new Map<string, string>() // id -> familyId
if (db) for (const s of (await db.collection('documents').get()).docs) existingIds.set(s.id, s.data().familyId ?? s.id)

const used = new Set<string>()
const problems: string[] = []
const plan: { e: Entry; path: string; hash: string; input: DocInput }[] = []

for (const e of catalog.entries) {
  const path = locate(e)
  if (!path) {
    problems.push(`לא נמצא בתיקייה: ${e.file}`)
    continue
  }
  const hash = sha(path)
  used.add(path)
  for (const n of e.duplicates) for (const p of byName.get(n.normalize('NFC')) ?? []) used.add(p)
  if (existingShas.has(hash)) {
    console.log(`• כבר בארכיון, מדלג: ${e.title}`)
    continue
  }
  if (!contentTypeFor(path)) {
    problems.push(`סוג קובץ לא נתמך: ${e.file}`)
    continue
  }
  const input: DocInput = {
    ...emptyInput(),
    ...Object.fromEntries(['title', 'folder', 'docType', 'status', 'publisher', 'meetingDate', 'year', 'restricted', 'versionLabel'].map((k) => [k, (e as never)[k]])),
    summary: [e.needsReview ? `⚠ לאימות: ${e.needsReview}` : '', e.summary].filter(Boolean).join('\n').slice(0, 3000),
    links: e.links.filter((l) => ids.has(l.targetFile)).map((l) => ({ type: l.type, to: ids.get(l.targetFile)! })),
  } as DocInput
  for (const dim of MULTI_DIMS) input[dim] = (e as unknown as Record<string, string[]>)[dim] ?? []
  for (const l of e.links) if (!ids.has(l.targetFile)) problems.push(`קישור ליעד שלא בקטלוג (${e.file} → ${l.targetFile})`)
  const errs = validateInput(input, tax)
  if (errs.length) {
    problems.push(`${e.file}: ${errs.join('; ')}`)
    continue
  }
  plan.push({ e, path, hash, input: normalizeInput(input) })
}

// ראש המשפחה: אם חבר משפחה כבר בארכיון - ה-familyId שלו; אחרת המסמך הראשון של המשפחה שמיובא עכשיו.
// כך familyId תמיד מצביע על מסמך קיים (כללי האבטחה דורשים זאת כשמעלים גרסה חדשה מהאפליקציה).
const familyHead = new Map<string, string>()
for (const e of catalog.entries) {
  if (!e.family || familyHead.has(e.family)) continue
  const fam = existingIds.get(ids.get(e.file)!)
  if (fam) familyHead.set(e.family, fam)
}
for (const { e } of plan) if (e.family && !familyHead.has(e.family)) familyHead.set(e.family, ids.get(e.file)!)
const pending = plan.flatMap(({ e }) => e.links.filter((l) => { const t = ids.get(l.targetFile)!; return !existingIds.has(t) && !plan.some((x) => x.e.file === l.targetFile) }))
if (pending.length) console.log(`\nℹ ${pending.length} קישורים מצביעים על מסמכים שעוד לא יובאו - יוצגו כ"לא זמין" עד שייובאו בהרצה הבאה.`)

const unknown = local.filter((p) => !used.has(p))

console.log(`\nתוכנית: ${plan.length} מסמכים לייבוא, ${problems.length} בעיות, ${unknown.length} קבצים שלא בקטלוג.`)
for (const p of problems) console.log('  ✗ ' + p)
if (unknown.length) {
  console.log('\nקבצים בתיקייה שלא בקטלוג (לתייק דרך הסקיל):')
  for (const p of unknown) console.log('  ? ' + p)
}
if (dry) {
  console.log('\n(הרצה יבשה - לא נכתב דבר)')
  process.exit(0)
}

// ---------- ביצוע ----------
for (const { e, path, hash, input } of plan) {
  const id = ids.get(e.file)!
  const name = safeFileName(basename(path))
  const storagePath = `files/${id}/${name}`
  const contentType = contentTypeFor(path)!
  const data = readFileSync(path)
  await bucket!.file(storagePath).save(data, {
    contentType,
    metadata: { contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, metadata: { uploadedBy: asEmail } },
  })
  const fields = { ...input, linkTargets: [...new Set(input.links.map((l) => l.to))] }
  const batch = db!.batch()
  batch.set(db!.doc(`documents/${id}`), {
    ...fields,
    familyId: e.family ? familyHead.get(e.family)! : id,
    isCurrent: e.current !== false,
    archived: false,
    file: { path: storagePath, name, size: data.length, contentType, sha256: hash },
    originalName: basename(path).slice(0, 300),
    createdBy: asEmail,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: asEmail,
    updatedAt: FieldValue.serverTimestamp(),
    rev: 1,
  })
  batch.set(db!.doc(`documents/${id}/history/1`), {
    rev: 1, by: asEmail, at: FieldValue.serverTimestamp(), action: 'create', changes: { ...diffInputs({}, fields), importedFrom: { from: null, to: basename(path) } },
  })
  await batch.commit()
  console.log(`✓ ${e.title}${e.versionLabel ? ` (${e.versionLabel})` : ''}`)
}
console.log(`\nהסתיים: ${plan.length} מסמכים יובאו.`)
