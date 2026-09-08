/**
 * Shifts the annual plan so it starts in August 2026.
 *
 * The seeded tasks all landed in calendar 2027 (Jan–Dec), so a 2026 view showed
 * nothing at all. The work-year runs Aug 2026 → Jul 2027, so every task moves
 * back five months, keeping day-of-month and duration intact.
 *
 * Usage: node scripts/shift-task-year.mjs [--dry]
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const SA = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'
if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(SA, 'utf8'))) })
const db = getFirestore()

const MONTHS_BACK = 5
const dry = process.argv.includes('--dry')

const shift = (ts) => {
  if (!ts?.toDate) return null
  const d = ts.toDate()
  const day = d.getUTCDate()
  const moved = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - MONTHS_BACK, 1,
                                  d.getUTCHours(), d.getUTCMinutes()))
  // Clamp for short months (e.g. 31st → 28th) rather than rolling into the next.
  const lastDay = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate()
  moved.setUTCDate(Math.min(day, lastDay))
  return Timestamp.fromDate(moved)
}

const snap = await db.collection('tasks').get()
let n = 0
const months = {}
for (const doc of snap.docs) {
  const t = doc.data()
  const start = shift(t.startDate)
  const end = shift(t.endDate)
  if (!start && !end) continue
  const key = start?.toDate().toISOString().slice(0, 7)
  if (key) months[key] = (months[key] || 0) + 1
  if (!dry) {
    const patch = {}
    if (start) patch.startDate = start
    if (end) patch.endDate = end
    await doc.ref.update(patch)
  }
  n++
}
console.log(`${dry ? '[dry] would shift' : 'shifted'} ${n}/${snap.size} tasks back ${MONTHS_BACK} months`)
console.log('start months:', JSON.stringify(Object.fromEntries(Object.entries(months).sort())))
process.exit(0)
