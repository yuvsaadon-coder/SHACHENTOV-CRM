/**
 * Adds quarterly community-group update tasks for רכזת מתנדבים:
 *   VOL-15 — ינואר 2027
 *   VOL-16 — אפריל 2027 (חלוקת פסח)
 *   VOL-17 — ספטמבר 2026
 *   VOL-18 — אוקטובר 2026
 *
 * Usage: node scripts/add-vol-community-updates.mjs
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

const STEPS = (context) =>
  `1) ניסוח פוסט/הודעה לקבוצות הקהילה — ${context}\n` +
  '2) פרסום בכל קבוצות הווטסאפ / פייסבוק הרלוונטיות\n' +
  '3) מענה לפניות מתנדבים חדשים שמגיעות בעקבות הפרסום\n' +
  '4) רישום מתנדבים מתעניינים לטבלת גיוס'

const NEW_TASKS = [
  {
    id: 'VOL-15',
    domain: 'VOL',
    category: 'גיוס מתנדבים',
    title: 'עדכון קבוצות קהילה — ינואר',
    steps: STEPS('פתיחת שנה / עדכון פעילות ותאריכי חלוקה לחצי השנה הראשון'),
    frequency: 'שנתי',
    startDate: d(2027, 1, 1),
    endDate: d(2027, 1, 31),
    holidayAnchor: null,
    responsible: 'רכזת מתנדבים',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'חלק ממחזור עדכונים רבעוני — ינואר, אפריל (פסח), ספטמבר, אוקטובר.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'VOL-16',
    domain: 'VOL',
    category: 'גיוס מתנדבים',
    title: 'עדכון קבוצות קהילה — חלוקת פסח',
    steps: STEPS('גיוס מתנדבים לחלוקות פסח — תאריכים, מיקומים ואיך להצטרף'),
    frequency: 'שנתי',
    startDate: d(2027, 4, 1),
    endDate: d(2027, 4, 30),
    holidayAnchor: 'פסח',
    responsible: 'רכזת מתנדבים',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'לפרסם לפחות שבועיים לפני תחילת חלוקות הפסח. חלק ממחזור עדכונים רבעוני.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'VOL-17',
    domain: 'VOL',
    category: 'גיוס מתנדבים',
    title: 'עדכון קבוצות קהילה — ספטמבר',
    steps: STEPS('פתיחת עונה — עדכון פעילות וחלוקות שנת הפעילות הקרובה'),
    frequency: 'שנתי',
    startDate: d(2026, 9, 1),
    endDate: d(2026, 9, 30),
    holidayAnchor: null,
    responsible: 'רכזת מתנדבים',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'פתיחת עונה — ספטמבר. חלק ממחזור עדכונים רבעוני.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'VOL-18',
    domain: 'VOL',
    category: 'גיוס מתנדבים',
    title: 'עדכון קבוצות קהילה — אוקטובר',
    steps: STEPS('גיוס מתנדבים לחלוקת חורף חם ולחלוקות הקרובות'),
    frequency: 'שנתי',
    startDate: d(2026, 10, 1),
    endDate: d(2026, 10, 31),
    holidayAnchor: null,
    responsible: 'רכזת מתנדבים',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'אוקטובר — גיוס לחורף חם ולחלוקות סוף השנה. חלק ממחזור עדכונים רבעוני.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },
]

async function main() {
  console.log('=== Adding community group update tasks ===\n')
  let added = 0
  for (const task of NEW_TASKS) {
    const ref = db.collection('tasks').doc(task.id)
    const snap = await ref.get()
    if (snap.exists) { console.log(`⚠ ${task.id} already exists — skipped`); continue }
    await ref.set(task)
    console.log(`✓ ${task.id.padEnd(7)} ${task.title}`)
    added++
  }
  console.log(`\n${added}/${NEW_TASKS.length} tasks added`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
