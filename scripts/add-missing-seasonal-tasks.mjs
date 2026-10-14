/**
 * Adds missing seasonal tasks identified in planning review:
 *
 *  1. PUB — פוסטים מתנות לאביונים + חלוקות פורים (יעל)  Feb–Mar 2027
 *     (DES-09 covers the design/דקלה side; this covers the content/posts/יעל side)
 *
 *  2. SUP — הכנת חורף חם — רכז ספקים                     Oct 2026
 *     (Procurement + logistics work by the suppliers coordinator every October)
 *
 *  3. JLM — חלוקת חורף חם                                  Nov 2026
 *     (Distribution of winter-warmth packages, follows the October SUP prep)
 *
 *  4. CEO — שי למוסדות מארחים — נובמבר                     Nov 2026
 *
 *  5. CEO — שי למוסדות מארחים — אפריל                      Apr 2027
 *
 * Usage: node scripts/add-missing-seasonal-tasks.mjs
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

const NEW_TASKS = [
  // ─── פורים — 23 Mar 2027 ───────────────────────────────────────────────────
  {
    id: 'PUB-04',
    domain: 'PUB',
    category: 'חג פורים',
    title: 'פוסטים מתנות לאביונים + פרסום חלוקות פורים',
    steps:
      '1) ינואר: קבלת בריף מדקלה (עיצובים + תאריכים) לקמפיין מתנות לאביונים\n' +
      '2) פברואר: כתיבת 3–4 פוסטים לפרסום מתנות לאביונים (תרומה / שותפות / שיתוף ציבור)\n' +
      '3) פברואר: פרסום בפייסבוק/אינסטגרם בתיאום לוח הזמנים עם דקלה\n' +
      '4) סוף פברואר–תחילת מרץ: כתיבת פוסטים על לוגיסטיקת חלוקות פורים — מיקומים, שעות, רכזים\n' +
      '5) לאחר הפורים: פרסום תודה + תוצאות הקמפיין (צילומים מהחלוקה)',
    frequency: 'לפי חג',
    startDate: d(2027, 2, 1),
    endDate: d(2027, 3, 22),
    holidayAnchor: 'פורים',
    responsible: 'יעל',
    involved: ['יעל', 'דקלה'],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'נוסף: פוסטים נפרדים מעיצוב (DES-09). פורים 23.3.2027.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },

  // ─── חורף חם — אוקטובר 2026 (SUP) ────────────────────────────────────────
  {
    id: 'SUP-04',
    domain: 'SUP',
    category: 'חורף חם',
    title: 'הכנת חורף חם — רכש וסיכום ספקים',
    steps:
      '1) קבלת אישור תקציבי ועדכון רשימת מוטבים לשנה הנוכחית\n' +
      '2) פנייה לספקים מהשנה הקודמת + בדיקת הצעות מחיר חדשות (כיסויים, שמיכות, גרביים, ציוד חורפי)\n' +
      '3) סיכום הזמנה וחתימת חוזה / אישור ספק\n' +
      '4) תיאום לוגיסטיקה של משלוח/איסוף עם JLM לפני חלוקת נובמבר\n' +
      '5) העברת פרטי הזמנה מסודרים ל-JLM לפני ה-1.11',
    frequency: 'שנתי',
    startDate: d(2026, 10, 1),
    endDate: d(2026, 10, 31),
    holidayAnchor: null,
    responsible: 'רכז ספקים',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'עבודה שנתית של רכז ספקים — כל אוקטובר, לפני חלוקת נובמבר (JLM-21).',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },

  // ─── חורף חם — נובמבר 2026 (JLM) ─────────────────────────────────────────
  {
    id: 'JLM-21',
    domain: 'JLM',
    category: 'חורף חם',
    title: 'חלוקת מארזי חורף חם',
    steps:
      '1) קבלת הזמנה מאושרת + רשימת מוטבים מ-SUP\n' +
      '2) תיאום נקודות חלוקה וצוותי מתנדבים עם רכזי הסניפים\n' +
      '3) ביצוע חלוקה בסניפים — שבוע ראשון–שני של נובמבר\n' +
      '4) דיווח לסיכום: כמויות, סניפים, בעיות שעלו',
    frequency: 'שנתי',
    startDate: d(2026, 11, 1),
    endDate: d(2026, 11, 30),
    holidayAnchor: null,
    responsible: 'יובל סעדון',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'תלוי ב-SUP-03 — חלוקה מתקיימת אחרי שהציוד מוזמן ומגיע.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },

  // ─── שי למוסדות מארחים — נובמבר 2026 (CEO) ───────────────────────────────
  {
    id: 'CEO-17',
    domain: 'CEO',
    category: 'יחסי ציבור',
    title: 'שי למוסדות מארחים — נובמבר',
    steps:
      '1) עדכון רשימת מוסדות מארחים פעילים לשנה הנוכחית\n' +
      '2) בחירת שי / מוצר מותגי (בתיאום עם דקלה במידת הצורך)\n' +
      '3) הזמנה + אריזה עד אמצע נובמבר\n' +
      '4) הגעה אישית / שיגור שי עם מכתב תודה אישי מהמנכ"ל',
    frequency: 'שנתי',
    startDate: d(2026, 11, 1),
    endDate: d(2026, 11, 25),
    holidayAnchor: null,
    responsible: 'מנכ"ל',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'מתרחש פעמיים בשנה — נובמבר ואפריל (CEO-18). ניהול אישי של המנכ"ל.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },

  // ─── שי למוסדות מארחים — אפריל 2027 (CEO) ────────────────────────────────
  {
    id: 'CEO-18',
    domain: 'CEO',
    category: 'יחסי ציבור',
    title: 'שי למוסדות מארחים — אפריל',
    steps:
      '1) עדכון רשימת מוסדות מארחים (ייתכן שינויים מנובמבר)\n' +
      '2) בחירת שי — לאחר פסח (ניתן לנצל מוצרים שנרכשו לחג)\n' +
      '3) הזמנה + אריזה עד אמצע אפריל\n' +
      '4) הגעה אישית / שיגור שי עם מכתב תודה מהמנכ"ל',
    frequency: 'שנתי',
    startDate: d(2027, 4, 15),
    endDate: d(2027, 4, 30),
    holidayAnchor: null,
    responsible: 'מנכ"ל',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'מתרחש פעמיים בשנה — נובמבר (CEO-17) ואפריל. ניהול אישי של המנכ"ל.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: now,
    updatedAt: now,
  },
]

async function main() {
  console.log('=== Adding missing seasonal tasks ===\n')
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

main().catch((err) => { console.error('Error:', err); process.exit(1) })
