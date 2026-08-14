/**
 * Brings the branches collection in line with the roles sheet.
 * Cafes and youth clubs were almost entirely missing, as were באר שבע,
 * קרית שמונה and פתח תקווה.
 *
 * Usage: node scripts/seed-branches.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
const SA = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'
if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(SA, 'utf8'))) })
const db = getFirestore()

// [name, city, type] — names carry "מועדון נוער" / "בית קפה" so the UI can split them.
const BRANCHES = [
  // סניפי מזון — ירושלים
  ['סלי מזון - ירושלים בקעה', 'ירושלים', 'food'],
  ['סלי מזון - ירושלים גילה', 'ירושלים', 'food'],
  ['סלי מזון - ירושלים נווה יעקב', 'ירושלים', 'food'],
  ['סלי מזון - ירושלים נחלאות', 'ירושלים', 'food'],
  ['סלי מזון - ירושלים קטמון', 'ירושלים', 'food'],
  ['סלי מזון - ירושלים קרית יובל', 'ירושלים', 'food'],
  ['סלי מזון - ירושלים רמות', 'ירושלים', 'food'],
  // סניפי מזון — חוץ
  ['סלי מזון - בית שמש', 'בית שמש', 'food'],
  ['סלי מזון - תל אביב', 'תל אביב', 'food'],
  ['סלי מזון - קדימה', 'קדימה', 'food'],
  ['סלי מזון - טבריה', 'טבריה', 'food'],
  ['סלי מזון - צפת', 'צפת', 'food'],
  ['סלי מזון - קרית שמונה', 'קרית שמונה', 'food'],
  ['סלי מזון - באר שבע', 'באר שבע', 'food'],
  ['סלי מזון - פתח תקווה', 'פתח תקווה', 'food'],
  // בתי קפה נודדים
  ['בית קפה נודד - ביה"ח כפר שאול', 'ירושלים', 'cafe_youth'],
  ['בית קפה נודד - בית אבות משען', 'ירושלים', 'cafe_youth'],
  ['בית קפה נודד - בית שאן', 'בית שאן', 'cafe_youth'],
  // מועדוני נוער (טוסטר)
  ['מועדון נוער - גילה', 'ירושלים', 'cafe_youth'],
  ['מועדון נוער - רמות', 'ירושלים', 'cafe_youth'],
  ['מועדון נוער - פסגת זאב', 'ירושלים', 'cafe_youth'],
  ['מועדון נוער - קרית מנחם', 'ירושלים', 'cafe_youth'],
]

const existing = await db.collection('branches').get()
const byName = new Map(existing.docs.map((d) => [d.data().name, d]))

let added = 0, kept = 0
for (const [name, city, type] of BRANCHES) {
  const found = byName.get(name)
  if (found) {
    await found.ref.update({ city, type })
    kept++
  } else {
    // Preserve coordinatorUids semantics: a new branch simply starts empty.
    await db.collection('branches').add({ name, city, type, coordinatorUids: [], coordinatorNames: [] })
    added++
  }
}
const extra = existing.docs.filter((d) => !BRANCHES.some(([n]) => n === d.data().name))
console.log(`✓ ${kept} updated, ${added} added — ${BRANCHES.length} branches total`)
if (extra.length) console.log(`  not in sheet (left alone): ${extra.map((d) => d.data().name).join(', ')}`)
process.exit(0)
