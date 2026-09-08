/**
 * Seeds the `roles` collection in Firestore from the uploaded roles_seed.json.
 * Idempotent: uses document ID from the role's `id` field.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node scripts/seed-roles.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const sa = JSON.parse(
  readFileSync(resolve('/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'), 'utf8')
)

if (getApps().length === 0) {
  initializeApp({ credential: cert(sa) })
}

const db = getFirestore()

const seedData = JSON.parse(
  readFileSync(resolve('/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/03b45acf-roles_seed.json'), 'utf8')
)

async function main() {
  console.log(`=== Seeding ${seedData.roles.length} roles to Firestore ===\n`)
  const batch = db.batch()
  let count = 0

  for (const role of seedData.roles) {
    const ref = db.collection('roles').doc(role.id)
    batch.set(ref, role, { merge: true })
    count++
  }

  await batch.commit()
  console.log(`✓ Seeded ${count} roles`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
