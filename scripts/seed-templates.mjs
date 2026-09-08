import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createRequire } from 'module'
import { readFileSync } from 'fs'

const sa = JSON.parse(readFileSync(
  '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json',
  'utf8'
))

initializeApp({ credential: cert(sa) })
const db = getFirestore()

const TEMPLATES = [
  {
    id: 'template-chelukat-yerushalayim',
    branchId: 'global',
    type: 'file',
    title: 'רשימת רכזי סניפי ירושלים — חלוקה',
    content: 'פורמט לניהול חלוקה לסניפי ירושלים: בקעה, גילה, נחלאות, קטמון, נווה יעקב, קרית מנחם',
    fileUrl: '/templates/חלוקת-ירושלים.xlsx',
    fileName: 'חלוקת-ירושלים.xlsx',
    fileSize: 57344,
    tags: ['חפיפה', 'פורמטים', 'לוגיסטיקה'],
    createdBy: 'system',
    createdAt: new Date(),
  },
  {
    id: 'template-chelukat-pdf',
    branchId: 'global',
    type: 'file',
    title: 'מסמך חפיפה — תבנית',
    content: 'תבנית מסמך חפיפה כללי לרכזי סניפים',
    fileUrl: '/templates/מסמך-חפיפה.pdf',
    fileName: 'מסמך-חפיפה.pdf',
    fileSize: 26624,
    tags: ['חפיפה', 'פורמטים'],
    createdBy: 'system',
    createdAt: new Date(),
  },
]

for (const t of TEMPLATES) {
  const { id, ...data } = t
  await db.collection('knowledgeItems').doc(id).set(data, { merge: true })
  console.log('✓', t.title)
}
console.log('Done.')
