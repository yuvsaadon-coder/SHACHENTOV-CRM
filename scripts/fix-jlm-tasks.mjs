/**
 * Fixes two JLM-domain gaps found by direct comparison against every other
 * domain's task set:
 *
 * 1. All 19 JLM tasks still had `responsible: 'כרמל'` — a stale name from
 *    before the roles rebuild. The current holder of "מנהל סניפי מזון
 *    ירושלים" is יובל סעדון (scripts/seed-org.mjs, sourced from the roles
 *    sheet). Updated to match.
 *
 * 2. Every other domain (CEO, DES, DON, FIN, PUB, SUP, VOL) has its earliest
 *    task starting 2026-08-01 — an onboarding/ongoing-management task. JLM's
 *    earliest was 2026-10-01; nothing was scheduled in the August "handover
 *    month". Added one ongoing task matching that domain-wide pattern,
 *    content drawn from the Jerusalem coordinator handover's own
 *    "תקשורת עם רכזים וסניפים" section (visits, sihot chatach, coordinator
 *    retention) — not invented, just not previously entered as a task.
 *
 * Usage: node scripts/fix-jlm-tasks.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const SA = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'
if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(SA, 'utf8'))) })
const db = getFirestore()

async function fixResponsible() {
  const jlm = await db.collection('tasks').where('domain', '==', 'JLM').get()
  const batch = db.batch()
  let n = 0
  jlm.docs.forEach((d) => {
    if (d.data().responsible === 'כרמל') {
      batch.update(d.ref, { responsible: 'יובל סעדון' })
      n++
    }
  })
  await batch.commit()
  console.log(`✓ responsible: "כרמל" → "יובל סעדון" on ${n} JLM tasks`)
}

async function addAugustTask() {
  const existing = await db.collection('tasks').doc('JLM-20').get()
  if (existing.exists) { console.log('✓ JLM-20 already exists — skipping'); return }

  await db.collection('tasks').doc('JLM-20').set({
    id: 'JLM-20',
    domain: 'JLM',
    category: 'ניהול שוטף',
    title: 'ביקורים בסניפים ושיחות חתך עם רכזים',
    steps:
      '1) קבע לוח ביקורים תקופתי בסניפי ירושלים (בכפוף לעומס האישי) — לחיבור ולראיית המצב בשטח\n' +
      '2) קיים שיחת חתך עם צוותי הרכזים אחת לחצי שנה; אם לא מתאפשר, וודא עדכון מעמיק בהודעות אחת לתקופה\n' +
      '3) קבע את שיחות החתך בסמוך להזמנות גדולות (חצי-שנתי/חגים) — אז לרכזים לרוב יש יותר לומר\n' +
      '4) מפה פערי מתנדבים/רכזים בסניפים בשיתוף רכז/ת המתנדבים וצוות הסושיאל',
    frequency: 'שוטף',
    startDate: Timestamp.fromDate(new Date(Date.UTC(2026, 7, 1))),
    endDate: Timestamp.fromDate(new Date(Date.UTC(2027, 6, 31))),
    holidayAnchor: null,
    responsible: 'יובל סעדון',
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: 'מקור: קובץ חפיפה — רכז/ת סניפי ירושלים, סעיף "תקשורת עם רכזים וסניפים". נוסף כי JLM היה הדומיין היחיד ללא משימה שמתחילה באוגוסט 2026 — לכל שאר הדומיינים יש משימת ניהול שוטף שמתחילה 1.8.2026.',
    createdBy: 'seed',
    updatedBy: 'seed',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  console.log('✓ added JLM-20 starting 2026-08-01')
}

async function main() {
  await fixResponsible()
  await addAugustTask()
  process.exit(0)
}
main().catch((err) => { console.error('Error:', err); process.exit(1) })
