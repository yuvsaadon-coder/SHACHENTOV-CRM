/**
 * Adds semi-annual "outside branches coordinator meetings" tasks:
 *   CEO-19 — November 2026
 *   CEO-20 — May 2027
 *
 * Responsible: רכז סניפי חוץ (if exists), otherwise delegated to מנכ"ל
 * Usage: node scripts/add-outside-coordinator-meetings.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const SA = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/be4bca96-shachentov-crm-firebase-adminsdk-fbsvc-5379520156.json'
if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(SA, 'utf8'))) })
const db = getFirestore()

const d = (y, m, day) => Timestamp.fromDate(new Date(Date.UTC(y, m - 1, day)))
const now = Timestamp.now()

const STEPS =
  '1) עדכון רשימת רכזי הסניפים החיצוניים הפעילים\n' +
  '2) תיאום תאריך ומיקום הפגישה (פיזית או זום) עם כל הרכזים\n' +
  '3) הכנת סדר יום: עדכונים תפעוליים, קשיים בשטח, תכניות קדימה\n' +
  '4) ניהול הפגישה ורישום סיכום\n' +
  '5) הפצת סיכום הפגישה לרכזים ולמנכ"ל תוך שבוע'

const NEW_TASKS = [
  {
    id: 'CEO-19',
    domain: 'CEO',
    category: 'ניהול שטח',
    title: 'פגישת רכזי חוץ — נובמבר',
    steps: STEPS,
    frequency: 'חצי שנתי',
    startDate: d(2026, 11, 1),
    endDate: d(2026, 11, 30),
    holidayAnchor: null,
    responsible: 'רכז סניפי חוץ',
    involved: ['מנכ"ל'],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'כשאין רכז סניפי חוץ — מואצל למנכ"ל. פגישה חוזרת אחת לחצי שנה (מאי ונובמבר). ראה גם CEO-20.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'CEO-20',
    domain: 'CEO',
    category: 'ניהול שטח',
    title: 'פגישת רכזי חוץ — מאי',
    steps: STEPS,
    frequency: 'חצי שנתי',
    startDate: d(2027, 5, 1),
    endDate: d(2027, 5, 31),
    holidayAnchor: null,
    responsible: 'רכז סניפי חוץ',
    involved: ['מנכ"ל'],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'כשאין רכז סניפי חוץ — מואצל למנכ"ל. פגישה חוזרת אחת לחצי שנה (מאי ונובמבר). ראה גם CEO-19.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },
]

async function main() {
  console.log('=== Adding outside coordinator meeting tasks ===\n')
  let added = 0
  for (const task of NEW_TASKS) {
    const ref = db.collection('tasks').doc(task.id)
    const snap = await ref.get()
    if (snap.exists) {
      console.log(`⚠ ${task.id} already exists — skipped`)
      continue
    }
    await ref.set(task)
    console.log(`✓ ${task.id.padEnd(7)} ${task.title}`)
    added++
  }
  console.log(`\n${added}/${NEW_TASKS.length} tasks added`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
