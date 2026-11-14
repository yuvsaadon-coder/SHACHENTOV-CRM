// התקנה ראשונית: זריעת מבנה התיוק (config/taxonomy) ויצירת מנהל/ת ראשון/ה.
// הרצה:
//   npm run setup -- --project <project-id> --admin you@example.org
// אפשר להריץ שוב בבטחה: הטקסונומיה לא נדרסת אם כבר קיימת (אלא עם --force-taxonomy).

import { readFileSync } from 'node:fs'
import { FieldValue } from 'firebase-admin/firestore'
import { arg, flag, initAdmin } from './admin-init.ts'
import { computeKeys, type Taxonomy } from '../src/lib/taxonomy.ts'

const admin = arg('admin')?.trim().toLowerCase()
if (!admin || !admin.includes('@')) {
  console.error('שימוש: npm run setup -- --project <project-id> --admin you@example.org [--force-taxonomy]')
  process.exit(1)
}

const { db, projectId } = initAdmin()
const tax = JSON.parse(readFileSync(new URL('../../taxonomy/taxonomy.json', import.meta.url), 'utf8')) as Taxonomy

const taxRef = db.doc('config/taxonomy')
const existing = await taxRef.get()
if (existing.exists && !flag('force-taxonomy')) {
  console.log(`• מבנה התיוק כבר קיים (גרסה ${existing.data()?.version}) - לא נדרס.`)
} else {
  const version = existing.exists ? (existing.data()?.version ?? 0) + 1 : tax.version
  const { $comment: _c, ...clean } = tax as Taxonomy & { $comment?: string }
  void _c
  await taxRef.set({ ...clean, version, keys: computeKeys(tax), updatedBy: 'setup-script', updatedAt: FieldValue.serverTimestamp() })
  console.log(`✓ מבנה התיוק נזרע (גרסה ${version}).`)
}

const counterRef = db.doc('config/counter')
if (!(await counterRef.get()).exists) {
  await counterRef.set({ next: 1 })
  console.log('✓ מונה המזהים הקבועים (AK-###) אותחל.')
}

await db.doc(`users/${admin}`).set(
  { role: 'admin', active: true, name: '', updatedBy: 'setup-script', updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
)
console.log(`✓ ${admin} הוגדר/ה כמנהל/ת בפרויקט ${projectId}.`)
console.log('  את שאר המשתמשים מוסיפים ממסך "ניהול" באפליקציה.')
