/**
 * Coordinators log in with name + phone (see netlify/functions/portal-login.ts),
 * so their phone number IS their password. The stored value carried dashes
 * (e.g. "052-7320074") copied straight from the source sheet — this strips
 * them so the password handed to a coordinator is plain digits.
 * Login itself already normalizes both sides, so this is a display/data
 * cleanliness fix, not a login-breaking change.
 *
 * Usage: node scripts/strip-coordinator-phone-dashes.mjs
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

async function main() {
  const snap = await db.collection('users').where('role', '==', 'coordinator').get()
  let updated = 0
  for (const doc of snap.docs) {
    const phone = doc.data().phone ?? ''
    const digits = phone.replace(/\D/g, '')
    if (digits && digits !== phone) {
      await doc.ref.update({ phone: digits })
      console.log(`✓ ${doc.data().name}: "${phone}" → "${digits}"`)
      updated++
    }
  }
  console.log(`\n${updated}/${snap.size} coordinator phone numbers normalized`)
  process.exit(0)
}

main().catch((err) => { console.error('Error:', err); process.exit(1) })
