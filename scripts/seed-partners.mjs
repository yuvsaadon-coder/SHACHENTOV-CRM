/**
 * Fills in the payment platforms and adds the volunteering platforms.
 *  - Existing payment platforms (matched by name) get their type, category and links — only the
 *    fields that are still empty, so nothing a person typed is overwritten.
 *  - The volunteering platforms from the spec's opening table are added if missing (status
 *    "potential" until someone updates it, as the spec says).
 *
 * Usage: node scripts/seed-partners.mjs           (dry run)
 *        node scripts/seed-partners.mjs --apply
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const APPLY = process.argv.includes('--apply')
const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
if (!SA_PATH) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH to the service-account JSON file')
if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) })
}
const db = getFirestore()

const PAYMENT = [
  { name: 'ריווחית', websiteUrl: 'https://www.rivhit.co.il', adminUrl: 'https://invoice.rivhit.co.il/' },
  { name: 'JGive / קרן עשור', websiteUrl: 'https://www.jgive.com/new/he/usd/charity-organizations/1803' },
  { name: 'GROW', websiteUrl: 'https://grow.co.il' },
  { name: 'Pay Plus', websiteUrl: 'https://payplus.co.il' },
]

const VOLUNTEERING = [
  { name: 'רוח טובה', websiteUrl: 'https://www.ruachtova.org.il' },
  { name: 'לב אחד', websiteUrl: 'https://levechad.org' },
  { name: 'HELPI', websiteUrl: 'https://helpi.co.il' },
]

const existing = await db.collection('hq_partners').get()
const byName = new Map(existing.docs.map((d) => [String(d.data().name ?? '').trim(), d]))

for (const p of PAYMENT) {
  const snap = byName.get(p.name)
  if (!snap) { console.log(`missing payment platform "${p.name}" — not created (add it in the app)`); continue }
  const cur = snap.data()
  const patch = {}
  if (!cur.partnerType || cur.partnerType === 'partner') patch.partnerType = 'payment'
  if (!Array.isArray(cur.categories) || cur.categories.length === 0) patch.categories = ['finance']
  if (!cur.websiteUrl && p.websiteUrl) patch.websiteUrl = p.websiteUrl
  if (!cur.adminUrl && p.adminUrl) patch.adminUrl = p.adminUrl
  if (Object.keys(patch).length === 0) { console.log(`"${p.name}": already complete`); continue }
  console.log(`"${p.name}": set ${Object.keys(patch).join(', ')}`)
  if (APPLY) await snap.ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'seed' })
}

for (const p of VOLUNTEERING) {
  if (byName.has(p.name)) { console.log(`"${p.name}": already exists`); continue }
  console.log(`"${p.name}": add (volunteering, potential)`)
  if (APPLY) {
    await db.collection('hq_partners').add({
      name: p.name,
      partnerType: 'volunteering',
      categories: ['volunteering'],
      status: 'potential',
      websiteUrl: p.websiteUrl,
      statusHistory: [{ status: 'potential', changedBy: 'seed', changedAt: Timestamp.now() }],
      branchIds: [],
      files: [],
      active: true,
      createdBy: 'seed',
      updatedBy: 'seed',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
}
console.log(APPLY ? 'Applied' : 'Dry run — add --apply to write')
