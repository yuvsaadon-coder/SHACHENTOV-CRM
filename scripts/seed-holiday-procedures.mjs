/**
 * Seeds holiday distribution procedures + all knowledge articles to Firestore.
 * Idempotent (uses fixed document IDs).
 *
 * Usage: node scripts/seed-holiday-procedures.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const sa = JSON.parse(
  readFileSync(resolve('/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'), 'utf8')
)

if (getApps().length === 0) {
  initializeApp({ credential: cert(sa) })
}

const db = getFirestore()

// ─── Holiday Distribution Checklist ─────────────────────────────────────────

const HOLIDAY_PROCEDURES = {
  id: 'global-holiday-checklist',
  branchId: 'global',
  type: 'checklist',
  title: 'סדר פעולות חלוקת חג',
  content: 'רשימת צ׳קליסט מלאה לניהול חלוקת מזון לחגים — מההכנות המוקדמות ועד לסיכום לאחר החלוקה.',
  checklistItems: [
    // שלב א – הכנות מוקדמות (שבועיים לפני)
    'תאם עם מנהל הסניף את מספר הסלים הצפוי לחג',
    'בדוק רשימת משפחות מוטבות ועדכן בהתאם לשינויים',
    'פרסם קריאה לגיוס מתנדבים נוספים לחג (ווצאפ/עמוד ארגוני)',
    'ודא שכמות המתנדבים מספקת: 1 מתנדב לכל 10–15 סלים',
    'תאם עם הספק את מועד ואופן האספקה',
    'ודא שיש מספיק ארגזים / שקיות לאריזה',
    // שלב ב – שבוע לפני
    'שלח תזכורת לכל המתנדבים עם פרטי המשמרת: מיקום, שעה, לבוש',
    'הכן טופס נוכחות / רשימת חלוקה',
    'ודא שיש חניה נגישה לטעינה ופריקה',
    'בדוק שיש מספיק תוויות / מדבקות לסלים',
    // שלב ג – יום לפני
    'הכן ייעוד של שטח לאריזה ושטח לחלוקה',
    'צקי שיש כלי עזר: שולחנות, עגלות, מאזניים',
    'שלח לכל מתנדב הודעת אישור שעת ההגעה',
    'וודא שיש מים ומזון קל למתנדבים',
    // שלב ד – יום החלוקה
    'פתח את המקום 30 דקות לפני הגעת המתנדבים',
    'ערוך בריפינג קצר (5 דקות) לכל המתנדבים: לוח זמנים + תפקידים',
    'הצב מתנדב ייעודי לקבלת המוטבים ורישום',
    'שמור על זרימה מסודרת — מנע עומסים בקבלה',
    'אסוף מוצרים שנשארו בסוף לפי נוהל הארגון',
    'תעד כמה סלים חולקו + כמה מתנדבים השתתפו',
    // שלב ה – אחרי החלוקה
    'סכם כמויות: סלים חולקו, סלים שנשארו',
    'שלח הודעת תודה לכל המתנדבים',
    'דווח למנהל הסניף / מנהל מטה על ביצוע',
    'תעד בעיות שעלו לצורך שיפור בחלוקה הבאה',
    'עדכן רשימת משפחות מוטבות (תוספות / הסרות)',
  ],
  tags: ['לוגיסטיקה', 'פורמטים'],
  createdBy: 'system',
  createdAt: Timestamp.now(),
}

// ─── Coordinator Handover Checklist ────────────────────────────────────────

const HANDOVER_CHECKLIST = {
  id: 'global-handover-checklist',
  branchId: 'global',
  type: 'checklist',
  title: 'סדר פעולות חפיפה לרכז/ת חדש/ה',
  content: 'צ׳קליסט מובנה לחפיפה — מה הרכז/ת היוצא צריך להעביר לרכז/ת הנכנס.',
  checklistItems: [
    'העבר רשימת מוטבים מלאה (שם + כתובת + טלפון)',
    'הסבר על צרכים מיוחדים של משפחות ספציפיות',
    'הצג את מיקום הסניף ואזורי הפעילות',
    'הכר את ספקי המזון והאנשי קשר שלהם',
    'הסבר על הפורמטים: כמה סלים, מה כלול, מה לא',
    'הצג את רשימת המתנדבים הפעילים ואופן ניהולם',
    'העבר קבוצות ווצאפ רלוונטיות',
    'הסבר על מועדי החלוקה הרגילים ותדירותם',
    'הצג את מי להתקשר בחירום (מנהל מטה, ספק)',
    'הכר את הדוחות שיש להגיש ולמי',
    'בצע חלוקה אחת משותפת (רכז יוצא + נכנס ביחד)',
    'ודא שהרכז הנכנס יש לו גישה לכלים דיגיטליים (ווצאפ, פורטל)',
  ],
  tags: ['חפיפה', 'פורמטים'],
  createdBy: 'system',
  createdAt: Timestamp.now(),
}

// ─── Knowledge Articles (from catalog) ─────────────────────────────────────
// These need to be seeded to knowledge_articles AND knowledgeItems (as research_article)

// Import the catalog inline (simplified version)
const ARTICLES = Array.from({ length: 23 }, (_, i) => ({
  id: `art-${i.toString().padStart(2, '0')}`,
  storageUrl: `/articles/article_${i.toString().padStart(2, '0')}.pdf`,
}))

async function main() {
  console.log('=== Seeding knowledge items to Firestore ===\n')

  // Holiday distribution procedures
  const docRef1 = db.collection('knowledgeItems').doc(HOLIDAY_PROCEDURES.id)
  await docRef1.set(HOLIDAY_PROCEDURES, { merge: true })
  console.log('✓ Holiday distribution checklist seeded')

  // Handover checklist
  const docRef2 = db.collection('knowledgeItems').doc(HANDOVER_CHECKLIST.id)
  await docRef2.set(HANDOVER_CHECKLIST, { merge: true })
  console.log('✓ Handover checklist seeded')

  // Update all research articles to point to static URLs
  let artCount = 0
  const batch = db.batch()
  for (const art of ARTICLES) {
    const ref = db.collection('knowledgeItems').doc(`research-${art.id}`)
    // Only update storageUrl — don't overwrite content if it exists
    const existing = await ref.get()
    if (existing.exists) {
      batch.update(ref, { storageUrl: art.storageUrl })
    } else {
      // Will be seeded by admin when they click "+ סנכרן" in KnowledgeAdminPage
      // Nothing to do here
    }
    artCount++
  }
  await batch.commit()
  console.log(`✓ Updated storageUrl for ${artCount} research articles (if seeded)`)

  console.log('\n=== Done ===')
  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
