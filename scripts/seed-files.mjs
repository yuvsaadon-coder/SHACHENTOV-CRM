/**
 * Puts the source documents where they are actually used.
 *
 * Why this script exists: earlier passes decomposed the handover files into
 * summary snippets scattered across knowledge collections. That is not what was
 * asked for. The files belong whole, downloadable, in the HQ knowledge base —
 * and the order/quote formats belong attached to the tasks that use them, which
 * is where the "לשונית חלוקת חג" the user opens actually lives (a task category).
 *
 * Effects:
 *   1. Removes the decomposed items from hq_knowledge and knowledgeItems.
 *      The research library (research-art-*) is left alone — it is the only
 *      knowledge the coordinator portal should carry.
 *   2. Seeds hq_knowledge with whole files (fileUrl → /templates/...).
 *   3. Attaches each format file to every task in its category, under
 *      tasks/{id}/attachments, which is what the task screen reads.
 *
 * Usage: node scripts/seed-files.mjs
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
const now = () => Timestamp.now()

// ── 1. Whole files in the HQ knowledge base ─────────────────────────────────
// domain/category match src/types HQKnowledgeCategory + Domain.

const HQ_FILES = [
  {
    id: 'file-hafifa-mankal',
    domain: 'CEO', category: 'handover',
    title: 'תיק חפיפה — מנכ״ל/ית (מסמך משולב)',
    content: 'איחוד שני תיקי החפיפה לתפקיד המנכ״ל/ית תחת מסמך אחד. חלק א׳ — חפיפת הילה, הקובע במקרה של סתירה. חלק ב׳ — חפיפת מורן (שלוש פגישות, 2023) כרקע מלא. שני החלקים במלואם, ללא קיצור.',
    fileUrl: '/templates/hafifa-mankal-meuchad.docx',
    tags: ['חפיפה', 'מנכ״ל'],
  },
  {
    id: 'file-hafifa-yerushalayim',
    domain: 'JLM', category: 'handover',
    title: 'קובץ חפיפה — רכז/ת סניפי ירושלים',
    content: 'הגדרת התפקיד המלאה: תחומי אחריות, פירוט הסניפים, ספקים קבועים, הזמנה חצי-שנתית, חלוקות חג, מעקב תקציב ותקשורת עם רכזים.',
    fileUrl: '/templates/hafifa-rakaz-yerushalayim.docx',
    tags: ['חפיפה', 'סניפי ירושלים'],
  },
  {
    id: 'file-hafifa-hila',
    domain: 'CEO', category: 'handover',
    title: 'קובץ חפיפה — הילה (מקור)',
    content: 'מסמך המקור של חפיפת הילה, כפי שהתקבל. משמש כחלק א׳ במסמך המשולב.',
    fileUrl: '/templates/hafifa-hila.docx',
    tags: ['חפיפה', 'מנכ״ל'],
  },
  {
    id: 'file-hafifa-moran',
    domain: 'CEO', category: 'handover',
    title: 'קובץ חפיפה — מורן (מקור)',
    content: 'מסמך המקור של חפיפת מורן, כפי שהתקבל. משמש כחלק ב׳ במסמך המשולב.',
    fileUrl: '/templates/hafifa-mankal-moran.docx',
    tags: ['חפיפה', 'מנכ״ל'],
  },
  // Deliberately NOT listing the roles/contacts source xlsx here — its data
  // belongs structured in the /roles and /contacts pages (which is where
  // scripts/seed-org.mjs puts it), not as a raw file download in HQ knowledge.
  {
    id: 'file-jlm-list',
    domain: 'JLM', category: 'instructions',
    title: 'רשימת סניפי ירושלים ופרטיהם',
    content: 'רכזים, תדירות חלוקה, יום פעילות ומספר סלים לכל סניף.',
    fileUrl: '/templates/חלוקת-ירושלים.xlsx',
    tags: ['סניפי ירושלים'],
  },
  {
    id: 'file-hafifa-template',
    domain: 'all', category: 'handover',
    title: 'מסמך חפיפה — תבנית ריקה',
    content: 'תבנית למילוי בעת חפיפה בין רכזים.',
    fileUrl: '/templates/מסמך-חפיפה.pdf',
    tags: ['חפיפה'],
  },
]

// ── 2. Formats, attached to the task categories that use them ───────────────

const HOLIDAY_FORMATS = [
  ['בקשה להצעת מחיר — פסח (יבשים)', '/templates/hagim/pesach-bakasha-hatzaat-mechir.xlsx'],
  ['בקשה להצעת מחיר — ראש השנה (יבשים)', '/templates/hagim/rosh-hashana-bakasha-hatzaat-mechir.xlsx'],
  ['מעקב תיאומים ותחשיב כולל לחג', '/templates/hagim/hagim-teumim-vetachshiv.xlsx'],
  ['פרטי קשר לספקים — חגים', '/templates/hagim/hagim-pratei-kesher-sapakim.xlsx'],
  ['פורמט לספק — יבשים (אריזות)', '/templates/hagim/sapak-arizot-pesach.xlsx'],
  ['פורמט לספק — ביצים', '/templates/hagim/sapak-beitzim-pesach.xlsx'],
  ['פורמט לספק — עופות', '/templates/hagim/sapak-ofot-pesach.xlsx'],
  ['פורמט לספק — ירקות', '/templates/hagim/sapak-yerakot-pesach.xlsx'],
]

const SEMIANNUAL_FORMATS = [
  ['בקשה להצעת מחיר — יבשים (חצי-שנתית)', '/templates/hatzi-shnatit/bakasha-hatzaat-mechir-yeveshim.xlsx'],
  ['השוואת מחירי ספקים — יבשים', '/templates/hatzi-shnatit/hashvaat-mechirim-yeveshim.xlsx'],
  ['כמויות לפי סניפים', '/templates/hatzi-shnatit/kamuyot-lefi-snifim.xlsx'],
  ['תכנון ומעקב עופות שנתי', '/templates/hatzi-shnatit/tichnun-ofot.xlsx'],
]

const JLM_HANDOVER = ['קובץ חפיפה — רכז/ת סניפי ירושלים', '/templates/hafifa-rakaz-yerushalayim.docx']

/** Task category → the files that category needs on hand. */
const FILES_BY_CATEGORY = {
  'חלוקות חגים':        [...HOLIDAY_FORMATS, JLM_HANDOVER],
  'חגים – ריכוז-על':    [...HOLIDAY_FORMATS, JLM_HANDOVER],
  'רכש חגים':           [...HOLIDAY_FORMATS, JLM_HANDOVER],
  'פסח':                [...HOLIDAY_FORMATS, JLM_HANDOVER],
  'ראש השנה':           [...HOLIDAY_FORMATS, JLM_HANDOVER],
  'הזמנות חצי-שנתיות':  [...SEMIANNUAL_FORMATS, JLM_HANDOVER],
  'רכש שוטף':           [...SEMIANNUAL_FORMATS],
  'חפיפה והקמה':        [
    ['תיק חפיפה — מנכ״ל/ית (משולב)', '/templates/hafifa-mankal-meuchad.docx'],
    JLM_HANDOVER,
    ['קובץ תפקידים ואנשי קשר 2026', '/templates/tafkidim-veanshei-kesher-2026.xlsx'],
    ['מסמך חפיפה — תבנית ריקה', '/templates/מסמך-חפיפה.pdf'],
  ],
}

// Items seeded by the earlier decomposition pass, removed here.
const DECOMPOSED_HQ = [
  'hq-mivne-irguni', 'hq-ishurim-shnatiyim', 'hq-snifim-hutz', 'hq-moadonei-noar-batei-kafe',
  'hq-taktziv', 'hq-platformot-slika', 'hq-yarid-arbaat-haminim', 'hq-hagim-mate',
  'hq-erev-rakazim', 'hq-platformot-hinamiyot', 'hq-bituach-mitnadvim', 'hq-shitufei-peula',
]

async function main() {
  console.log('=== Placing source files where they are used ===\n')

  // 1. Clear the decomposed knowledge.
  for (const id of DECOMPOSED_HQ) await db.collection('hq_knowledge').doc(id).delete()
  console.log(`✓ Removed ${DECOMPOSED_HQ.length} decomposed items from hq_knowledge`)

  const ki = await db.collection('knowledgeItems').get()
  let removed = 0
  for (const d of ki.docs) {
    // Keep only the research library in the coordinator portal.
    if (d.id.startsWith('research-art-')) continue
    await d.ref.delete()
    removed++
  }
  console.log(`✓ Removed ${removed} non-research items from the coordinator portal`)

  // 2. Whole files into the HQ knowledge base.
  for (const item of HQ_FILES) {
    const { id, fileUrl, ...rest } = item
    await db.collection('hq_knowledge').doc(id).set({
      ...rest,
      fileUrl,
      fileName: decodeURIComponent(fileUrl.split('/').pop()),
      createdBy: 'system',
      createdAt: now(),
    }, { merge: true })
  }
  console.log(`✓ ${HQ_FILES.length} whole files in hq_knowledge (downloadable)`)

  // 3. Attach formats to the tasks in each category.
  const tasks = await db.collection('tasks').get()
  let attached = 0
  const perCategory = {}

  for (const task of tasks.docs) {
    const category = task.data().category
    const files = FILES_BY_CATEGORY[category]
    if (!files) continue

    // Replace previously seeded attachments so re-runs stay idempotent.
    const existing = await task.ref.collection('attachments').where('seeded', '==', true).get()
    for (const d of existing.docs) await d.ref.delete()

    for (const [fileName, url] of files) {
      await task.ref.collection('attachments').add({
        fileName,
        storageUrl: url,
        uploadedBy: 'מערכת',
        uploadedAt: now(),
        seeded: true,
      })
      attached++
    }
    perCategory[category] = (perCategory[category] ?? 0) + files.length

    // Denormalized count (seeded + any manual uploads) drives the 📎 badge on
    // task cards — without it, files attached here are invisible unless
    // someone opens the task and clicks into the "קבצים" tab.
    const total = await task.ref.collection('attachments').get()
    await task.ref.set({ attachmentCount: total.size }, { merge: true })
  }

  console.log(`✓ ${attached} file attachments across ${Object.keys(perCategory).length} task categories`)
  Object.entries(perCategory).forEach(([c, n]) => console.log(`   ${String(n).padStart(3)}  ${c}`))

  const uncovered = [...new Set(tasks.docs.map((d) => d.data().category))]
    .filter((c) => !FILES_BY_CATEGORY[c])
  console.log(`\nCategories with no files attached (${uncovered.length}): ${uncovered.join(', ')}`)

  process.exit(0)
}

main().catch((err) => { console.error('Error:', err); process.exit(1) })
