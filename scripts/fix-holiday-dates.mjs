/**
 * Realigns holiday-anchored ("לפי חג") task dates to the real Hebrew calendar
 * for the Aug 2026 – Jul 2027 work year, computed via @hebcal/core:
 *   ראש השנה   12–13 Sep 2026        חנוכה   4–12 Dec 2026
 *   סוכות      26 Sep – 3 Oct 2026   פורים   23 Mar 2027
 *   פסח        22–28 Apr 2027        שבועות  11 Jun 2027
 *
 * The prior seed placed these with no relation to those dates (e.g. Rosh
 * Hashana prep tasks in March 2027, Chanukah tasks in July 2027) — this
 * script assigns each anchored task an explicit, deliberate date range:
 * prep/design/procurement-planning tasks land in the month before the
 * holiday, and packing/distribution/"days before" tasks land in the
 * holiday's own month, ending at or before the holiday's start.
 *
 * Usage: node scripts/fix-holiday-dates.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'
if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) })
}
const db = getFirestore()
const d = (s) => Timestamp.fromDate(new Date(`${s}T00:00:00Z`))

// id → [startDate, endDate], derived per-task from its role (prep vs. distribution)
// relative to the real holiday date above.
const FIXES = {
  // ראש השנה — 12–13 Sep 2026 → prep in August, distribution ending by Sep 11
  'JLM-10': [d('2026-08-01'), d('2026-08-15')], // איסוף זמנים + פרסומים לסושיאל
  'JLM-11': [d('2026-08-01'), d('2026-08-20')], // הכנת הזמנת יבשים לחג
  'JLM-12': [d('2026-08-25'), d('2026-09-11')], // אריזה וחלוקת חג
  'DES-05': [d('2026-08-01'), d('2026-08-25')], // עיצוב פרסום ר"ה + גלויות + מדבקות
  'SUP-02': [d('2026-08-25'), d('2026-09-11')], // רכש ירקות וחלות – ראש השנה
  'PUB-02': [d('2026-08-15'), d('2026-09-01')], // ניוזלטר ראש השנה

  // סוכות / יריד ד' מינים — 26 Sep – 3 Oct 2026 → prep/fair in Aug–Sep
  'CEO-16': [d('2026-08-15'), d('2026-09-20')], // יריד ד' המינים – ריכוז-על
  'DES-08': [d('2026-08-15'), d('2026-09-05')], // עיצוב מדבקות/קופסאות ממותגות ליריד
  'DES-06': [d('2026-09-01'), d('2026-09-19')], // עיצוב פרסום יריד + פרומו שבוע לפני

  // חנוכה — 4–12 Dec 2026 → prep in November, sufganiyot close to the holiday
  'JLM-16': [d('2026-11-01'), d('2026-11-25')], // רכש נרות + מטבעות שוקולד לסניפים
  'JLM-15': [d('2026-11-25'), d('2026-12-04')], // סופגניות
  'DES-11': [d('2026-11-01'), d('2026-11-25')], // עיצוב פוסטים – חנוכה ושבועות (anchor: חנוכה)

  // פורים — 23 Mar 2027 → prep in February, mishloach manot distribution in March
  'DES-09': [d('2027-02-01'), d('2027-02-20')], // עיצוב מתנות לאביונים + מחצית השקל
  'JLM-13': [d('2027-03-15'), d('2027-03-23')], // משלוחי מנות – קפה מיכאלה + פיזור לסניפים

  // פסח — 22–28 Apr 2027 → prep in March, packing/chametz/procurement in April
  'JLM-07': [d('2027-03-01'), d('2027-03-15')], // איסוף זמנים + פרסומים לסושיאל
  'JLM-08': [d('2027-03-01'), d('2027-03-20')], // הכנת הזמנת יבשים לחג
  'DES-03': [d('2027-03-01'), d('2027-03-15')], // עיצוב גלויות פסח
  'DES-02': [d('2027-03-05'), d('2027-03-25')], // עיצוב פרסום – זמני חלוקה + איסוף חמץ
  'DES-04': [d('2027-03-10'), d('2027-03-28')], // עיצוב מדבקות/סטיקרים לסגירת ארגזים
  'PUB-01': [d('2027-03-15'), d('2027-03-30')], // ניוזלטר פסח
  'SUP-01': [d('2027-04-01'), d('2027-04-15')], // רכש ירקות וחלות – פסח
  'JLM-09': [d('2027-04-05'), d('2027-04-21')], // אריזה וחלוקת חג
  'CEO-15': [d('2027-04-10'), d('2027-04-21')], // איסוף/מכירת חמץ

  // שבועות — 11 Jun 2027 → prep/dairy donation drive in May
  'JLM-14': [d('2027-05-01'), d('2027-05-25')], // תרומת מוצרי חלב – להפעיל את איתמר
}

async function main() {
  console.log('=== Realigning holiday task dates to the real Hebrew calendar ===\n')
  let updated = 0
  for (const [id, [startDate, endDate]] of Object.entries(FIXES)) {
    const ref = db.collection('tasks').doc(id)
    const snap = await ref.get()
    if (!snap.exists) { console.log(`✗ ${id} not found, skipped`); continue }
    const before = snap.data()
    await ref.set({ startDate, endDate }, { merge: true })
    console.log(`✓ ${id.padEnd(7)} ${before.title.padEnd(45)} ${before.startDate?.toDate().toISOString().slice(0,10)}..${before.endDate?.toDate().toISOString().slice(0,10)} → ${startDate.toDate().toISOString().slice(0,10)}..${endDate.toDate().toISOString().slice(0,10)}`)
    updated++
  }
  console.log(`\n${updated}/${Object.keys(FIXES).length} tasks updated`)
  process.exit(0)
}

main().catch((err) => { console.error('Error:', err); process.exit(1) })
