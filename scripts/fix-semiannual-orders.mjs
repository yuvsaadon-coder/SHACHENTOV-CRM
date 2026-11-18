/**
 * Dry orders are placed twice a year: the summer order is prepared in May, the winter order in
 * November (confirmed by the CEO). They are not tied to any holiday, so the stray Purim anchor
 * is removed. The summer delivery follows the preparation, in June. Each of the three happens once
 * a year, so they are annual (a half-yearly task would also show up six months later, on top of
 * the other season's order).
 *
 * Usage: node scripts/fix-semiannual-orders.mjs           (dry run)
 *        node scripts/fix-semiannual-orders.mjs --apply
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const APPLY = process.argv.includes('--apply')
const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
if (!SA_PATH) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH to the service-account JSON file')
if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) })
}
const db = getFirestore()
const d = (s) => Timestamp.fromDate(new Date(`${s}T00:00:00Z`))

const FIXES = {
  'JLM-04': [d('2027-05-01'), d('2027-05-31')], // הכנת הזמנת יבשים – קיץ
  'JLM-05': [d('2027-06-01'), d('2027-06-30')], // אספקת הזמנת יבשים – קיץ
  'JLM-06': [d('2026-11-01'), d('2026-11-30')], // הכנת הזמנת יבשים – חורף
}

for (const [id, [startDate, endDate]] of Object.entries(FIXES)) {
  const ref = db.collection('tasks').doc(id)
  const snap = await ref.get()
  if (!snap.exists) { console.log(id, 'missing — skipped'); continue }
  const t = snap.data()
  console.log(`${id} | ${t.title} | ${t.holidayAnchor ?? '-'} → none | ${t.startDate.toDate().toISOString().slice(0, 10)}..${t.endDate.toDate().toISOString().slice(0, 10)} → ${startDate.toDate().toISOString().slice(0, 10)}..${endDate.toDate().toISOString().slice(0, 10)}`)
  if (APPLY) await ref.update({ startDate, endDate, frequency: 'שנתי', holidayAnchor: FieldValue.delete(), updatedAt: Timestamp.now() })
}
console.log(APPLY ? 'Applied' : 'Dry run — add --apply to write')
