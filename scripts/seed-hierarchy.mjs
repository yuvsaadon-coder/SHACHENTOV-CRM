/**
 * Rebuilds the org-chart hierarchy (`reportsTo`) and the Jerusalem branch roster.
 *
 * Reporting lines come from the CEO handover ("מבנה הועד" / "המטה"), branch
 * rosters from "הגדרת תפקיד רכז/ת סניפי ירושלים" (July 2026) — which is the
 * authoritative list of Jerusalem branches, coordinators, frequency and basket counts.
 *
 * Usage: node scripts/seed-hierarchy.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'

if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) })
}
const db = getFirestore()

const CEO = 'ROLE-01'
const JLM_FOOD = 'ROLE-04'   // מנהל סניפי מזון ירושלים
const DONATIONS = 'ROLE-05'  // רכזת תרומות ופרוייקטים מיוחדים
const CAFES = 'ROLE-11'      // מנהל בתי קפה נודדים
const YOUTH = 'ROLE-12'      // מנהל מועדוני נוער (טוסטר)

/** roleId → the role it reports to. ROLE-01 is the root and appears nowhere. */
const REPORTS_TO = {
  // מטה — כל בעלי התפקידים עובדים מול המנכ"ל
  'ROLE-02': CEO, 'ROLE-03': CEO, 'ROLE-04': CEO, 'ROLE-05': CEO,
  'ROLE-07': CEO, 'ROLE-08': CEO, 'ROLE-10': CEO,
  'ROLE-11': CEO, 'ROLE-12': CEO, 'ROLE-13': CEO,
  // "אפרת- רכזת תרומות (דלית- גם מתעסקת בזה)"
  'ROLE-09': DONATIONS,
  // "שלמה בתפקיד רכז הספקים... הדבר עובר דרך רכז.ת סניפי ירושלים לאישור"
  'ROLE-06': JLM_FOOD,
  // "בשאר האזורים הרכזים של כל אזור מנהלים הכל בעצמם" — סניפי חוץ מול המנכ"ל
  'BR-C01': CEO, 'BR-C02': CEO, 'BR-C03': CEO, 'BR-C04': CEO,
  'BR-C05': CEO, 'BR-C06': CEO, 'BR-C07': CEO, 'BR-C08': CEO,
  // בתי קפה נודדים ומועדוני נוער
  'CAFE-01': CAFES, 'CAFE-02': CAFES, 'CAFE-03': CAFES,
  'TOAST-01': YOUTH, 'TOAST-02': YOUTH, 'TOAST-03': YOUTH, 'TOAST-04': YOUTH,
  // פתח תקווה ויריד ארבעת המינים — "מנכ״לית בקשר ישיר עם הרכזים של היריד"
  'ETIM-01': CEO, 'ETIM-02': CEO, 'ETIM-03': CEO, 'ETIM-04': CEO,
}

/**
 * Jerusalem branches exactly as listed in the handover's "פירוט הסניפים (יולי 26)"
 * table. `holders` preserves table order; an empty string means the slot is vacant.
 */
const JERUSALEM = [
  { area: 'בקעה',       freq: 'כל שבוע',        day: 'שישי',   baskets: 61, holders: ['יוחאי אבוטבול', 'שירה', 'שירי תהילה'] },
  { area: 'גילה',       freq: 'פעם בשבועיים',   day: 'שישי',   baskets: 57, holders: ['', 'לאה ליבנת', ''] },
  { area: 'נווה יעקב',  freq: 'פעם בשבועיים',   day: 'משתנה',  baskets: 30, holders: ['נעמי', 'חלי'] },
  { area: 'נחלאות',     freq: 'פעם בשבועיים',   day: 'חמישי',  baskets: 41, holders: ['עוז בינר', 'הדס', ''] },
  { area: 'קטמון',      freq: 'כל שבוע',        day: 'שישי',   baskets: 50, holders: ['ציפי זלמנוביץ׳', 'אסתי בראור', 'אביטל עזיז', 'כרמל קרופפלד'] },
  { area: 'קרית מנחם',  freq: 'כל שבוע',        day: 'שישי',   baskets: 41, holders: ['אלישי בר טימור', 'יהודית רוטקוביץ׳', 'דב קראוס', 'יהונתן אלבז'] },
  { area: 'רמות',       freq: 'כל שבוע',        day: 'שישי',   baskets: 41, holders: ['יאיר יעקבי', 'סיגל דאדי'] },
]

async function main() {
  console.log('=== Rebuilding org hierarchy ===\n')

  // 1. Replace the Jerusalem branch roles with the handover's roster.
  const existing = await db.collection('roles').where('level', '==', 'סניף ירושלים').get()
  const batch = db.batch()
  for (const doc of existing.docs) batch.delete(doc.ref)
  await batch.commit()
  console.log(`✓ Cleared ${existing.size} old Jerusalem branch roles`)

  let n = 0
  for (const branch of JERUSALEM) {
    for (const holder of branch.holders) {
      n++
      const id = `BR-J${String(n).padStart(2, '0')}`
      await db.collection('roles').doc(id).set({
        id,
        roleName: `רכז/ת סלי מזון – ${branch.area}`,
        level: 'סניף ירושלים',
        area: branch.area,
        holderName: holder,
        status: holder ? 'מאויש' : 'חסר',
        priority: holder ? 'רגיל' : 'גבוה',
        email: '',
        phone: '',
        linkedTaskIds: [],
        affectsTasks: false,
        delegatedTo: null,
        notes: `תדירות חלוקה: ${branch.freq} · יום פעילות: ${branch.day} · מס׳ סלים: ${branch.baskets}`,
        reportsTo: JLM_FOOD,
      })
    }
  }
  console.log(`✓ Seeded ${n} Jerusalem coordinator roles across ${JERUSALEM.length} branches`)

  // 2. Apply reporting lines to every other role.
  let linked = 0
  for (const [roleId, parent] of Object.entries(REPORTS_TO)) {
    const ref = db.collection('roles').doc(roleId)
    if (!(await ref.get()).exists) { console.warn(`  ! missing role ${roleId}`); continue }
    await ref.update({ reportsTo: parent })
    linked++
  }
  console.log(`✓ Set reportsTo on ${linked} roles (root: ${CEO})`)

  // 3. Report anything still unattached so it does not silently become a second root.
  const all = await db.collection('roles').get()
  const orphans = all.docs.filter((d) => d.id !== CEO && !d.data().reportsTo)
  if (orphans.length) {
    console.log(`\n⚠ ${orphans.length} roles without a parent (will render as extra roots):`)
    orphans.forEach((d) => console.log(`   ${d.id} — ${d.data().roleName}`))
  } else {
    console.log('✓ Every role is attached to the tree')
  }

  console.log('\n=== Done ===')
  process.exit(0)
}

main().catch((err) => { console.error('Error:', err); process.exit(1) })
