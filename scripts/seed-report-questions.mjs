/**
 * One-time seed of `reportQuestions`, preserving the field keys, order, labels
 * and types the quarterly-report form has always used (f1–f17 for food
 * branches, c1–c8 for cafe/youth branches) — existing submitted reports read
 * these same keys out of QuarterlyReport.data, so the keys must not change.
 *
 * After this runs, PortalReport.tsx renders itself from this collection, and
 * HQ can add/edit/reorder/delete questions from /admin/report-questions.
 *
 * Usage: node scripts/seed-report-questions.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const SA = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'
if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(SA, 'utf8'))) })
const db = getFirestore()

const RADIO_OPTS = ['כן', 'לא', 'דורש רענון']

const FOOD = [
  { key: 'f1',  section: 'סעיף 1 — היקף חלוקה',              label: 'כמות סלי מזון ממוצעת בחלוקה',           type: 'number' },
  { key: 'f2',  section: 'סעיף 2 — סטטוס ספקים',              label: 'מוצרים יבשים',                          type: 'rating' },
  { key: 'f3',  section: 'סעיף 2 — סטטוס ספקים',              label: 'עופות',                                 type: 'rating' },
  { key: 'f4',  section: 'סעיף 2 — סטטוס ספקים',              label: 'ביצים',                                 type: 'rating' },
  { key: 'f5',  section: 'סעיף 2 — סטטוס ספקים',              label: 'חלות',                                  type: 'rating' },
  { key: 'f6',  section: 'סעיף 2 — סטטוס ספקים',              label: 'ירקות',                                 type: 'rating' },
  { key: 'f7',  section: 'סעיף 2 — סטטוס ספקים',              label: 'שקיות / אריזה',                         type: 'rating' },
  { key: 'f8',  section: 'סעיף 3 — מלאי, אחסון ותשתיות',      label: 'חוסרים במלאי',                          type: 'textarea' },
  { key: 'f9',  section: 'סעיף 3 — מלאי, אחסון ותשתיות',      label: 'מצב מחסן/מקום האריזה',                  type: 'textarea' },
  { key: 'f10', section: 'סעיף 4 — מתנדבים וצוות',            label: 'ביטוח מתנדבים הופץ?',                   type: 'radio', options: RADIO_OPTS },
  { key: 'f11', section: 'סעיף 4 — מתנדבים וצוות',            label: 'מצב מתנדבי אריזה',                      type: 'textarea' },
  { key: 'f12', section: 'סעיף 4 — מתנדבים וצוות',            label: 'מצב מתנדבי חלוקה/נהגים',                type: 'textarea' },
  { key: 'f13', section: 'סעיף 4 — מתנדבים וצוות',            label: 'מתנדבי איסוף מספקים',                   type: 'textarea' },
  { key: 'f14', section: 'סעיף 5 — אווירה וצרכים',            label: 'מצב הרוח הכללי',                        type: 'textarea' },
  { key: 'f15', section: 'סעיף 5 — אווירה וצרכים',            label: 'במה המטה יכול לעזור?',                  type: 'textarea' },
  { key: 'f16', section: 'סעיף 6 — הקמה (דיווח ראשון)',       label: 'כמות מתנדבי אריזה אידיאלית',            type: 'text', firstReportOnly: true },
  { key: 'f17', section: 'סעיף 6 — הקמה (דיווח ראשון)',       label: 'כמות מתנדבי חלוקה/נהגים אידיאלית',      type: 'text', firstReportOnly: true },
]

const CAFE = [
  { key: 'c1', section: 'סעיף 1 — היקף פעילות',        label: 'כמות משתתפים ממוצעת בפעילות',  type: 'number' },
  { key: 'c2', section: 'סעיף 2 — ציוד ותשתיות',        label: 'מצב מבנה/ציוד/מקום',            type: 'textarea' },
  { key: 'c3', section: 'סעיף 2 — ציוד ותשתיות',        label: 'חוסרים בציוד/מלאי שוטף',        type: 'textarea' },
  { key: 'c4', section: 'סעיף 3 — מתנדבים',             label: 'ביטוח מתנדבים הופץ?',           type: 'radio', options: RADIO_OPTS },
  { key: 'c5', section: 'סעיף 3 — מתנדבים',             label: 'מצב מתנדבים כללי',              type: 'textarea' },
  { key: 'c6', section: 'סעיף 4 — אווירה וצרכים',       label: 'מצב הרוח הכללי',                type: 'textarea' },
  { key: 'c7', section: 'סעיף 4 — אווירה וצרכים',       label: 'במה המטה יכול לעזור?',          type: 'textarea' },
  { key: 'c8', section: 'סעיף 5 — הקמה (דיווח ראשון)',  label: 'כמות מתנדבים אידיאלית',         type: 'text', firstReportOnly: true },
]

async function seed(branchType, items) {
  let n = 0
  for (const item of items) {
    n++
    await db.collection('reportQuestions').doc(`${branchType}-${item.key}`).set({
      branchType,
      key: item.key,
      label: item.label,
      section: item.section,
      type: item.type,
      firstReportOnly: item.firstReportOnly ?? false,
      order: n,
      ...(item.options ? { options: item.options } : {}),
    }, { merge: true })
  }
  return n
}

async function main() {
  console.log('=== Seeding reportQuestions ===\n')
  const food = await seed('food', FOOD)
  const cafe = await seed('cafe_youth', CAFE)
  console.log(`✓ ${food} food questions, ${cafe} cafe/youth questions`)
  process.exit(0)
}

main().catch((err) => { console.error('Error:', err); process.exit(1) })
