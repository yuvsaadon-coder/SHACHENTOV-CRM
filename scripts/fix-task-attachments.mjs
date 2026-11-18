/**
 * Removes seeded attachments that do not belong on a holiday task (see
 * lib/taskAttachmentPolicy.mjs) and refreshes each task's attachmentCount.
 * Only attachments created by the seed script (seeded === true) are touched;
 * files people uploaded themselves are never deleted.
 *
 * Usage: node scripts/fix-task-attachments.mjs           (dry run, prints what would go)
 *        node scripts/fix-task-attachments.mjs --apply   (does it)
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { keepFile } from './lib/taskAttachmentPolicy.mjs'

const APPLY = process.argv.includes('--apply')
const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
if (!SA_PATH) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH to the service-account JSON file')
if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) })
}
const db = getFirestore()

const tasks = await db.collection('tasks').get()
let removed = 0
for (const task of tasks.docs) {
  const t = task.data()
  const atts = await task.ref.collection('attachments').get()
  const drop = atts.docs.filter((a) => a.data().seeded === true && !keepFile(t, a.data().storageUrl))
  if (drop.length === 0) continue
  console.log(`${task.id} | ${t.title} | ${t.holidayAnchor ?? '-'} | remove ${drop.length}, keep ${atts.size - drop.length}`)
  removed += drop.length
  if (!APPLY) continue
  for (const a of drop) await a.ref.delete()
  await task.ref.set({ attachmentCount: atts.size - drop.length }, { merge: true })
}
console.log(`${APPLY ? 'Removed' : 'Would remove'} ${removed} attachments`)
