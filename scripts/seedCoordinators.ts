/**
 * Seed script: creates 13 branches + 23 coordinator Firebase Auth users + Firestore docs.
 * Idempotent: skips if auth user already exists (email-already-in-use), updates coordinatorUids.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' npx ts-node scripts/seedCoordinators.ts
 *   (or set FIREBASE_SERVICE_ACCOUNT in .env and use dotenv-cli)
 */

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const raw = process.env.FIREBASE_SERVICE_ACCOUNT
if (!raw) {
  console.error('ERROR: FIREBASE_SERVICE_ACCOUNT env var is required')
  process.exit(1)
}

if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

const auth = getAuth()
const db = getFirestore()

interface BranchSeed {
  name: string
  city: string
  type: 'food' | 'cafe_youth'
  coordinatorEmails: string[]
}

const BRANCHES: BranchSeed[] = [
  {
    name: 'סניף ירושלים מרכז',
    city: 'ירושלים',
    type: 'food',
    coordinatorEmails: ['coord.jlm.center@shachentov.org'],
  },
  {
    name: 'סניף ירושלים צפון',
    city: 'ירושלים',
    type: 'food',
    coordinatorEmails: ['coord.jlm.north@shachentov.org'],
  },
  {
    name: 'סניף תל אביב יפו',
    city: 'תל אביב-יפו',
    type: 'food',
    coordinatorEmails: ['coord.tlv@shachentov.org', 'coord.tlv2@shachentov.org'],
  },
  {
    name: 'סניף חיפה',
    city: 'חיפה',
    type: 'food',
    coordinatorEmails: ['coord.haifa@shachentov.org'],
  },
  {
    name: 'סניף באר שבע',
    city: 'באר שבע',
    type: 'food',
    coordinatorEmails: ['coord.beersheva@shachentov.org'],
  },
  {
    name: 'סניף נתניה',
    city: 'נתניה',
    type: 'food',
    coordinatorEmails: ['coord.netanya@shachentov.org'],
  },
  {
    name: 'סניף פתח תקווה',
    city: 'פתח תקווה',
    type: 'food',
    coordinatorEmails: ['coord.petah@shachentov.org', 'coord.petah2@shachentov.org'],
  },
  {
    name: 'סניף ראשון לציון',
    city: 'ראשון לציון',
    type: 'food',
    coordinatorEmails: ['coord.rishon@shachentov.org'],
  },
  {
    name: 'סניף אשדוד',
    city: 'אשדוד',
    type: 'food',
    coordinatorEmails: ['coord.ashdod@shachentov.org'],
  },
  {
    name: 'סניף חולון',
    city: 'חולון',
    type: 'food',
    coordinatorEmails: ['coord.holon@shachentov.org'],
  },
  {
    name: 'קפה נוער ירושלים',
    city: 'ירושלים',
    type: 'cafe_youth',
    coordinatorEmails: ['coord.cafe.jlm@shachentov.org'],
  },
  {
    name: 'קפה נוער תל אביב',
    city: 'תל אביב-יפו',
    type: 'cafe_youth',
    coordinatorEmails: ['coord.cafe.tlv@shachentov.org'],
  },
  {
    name: 'קפה נוער חיפה',
    city: 'חיפה',
    type: 'cafe_youth',
    coordinatorEmails: ['coord.cafe.haifa@shachentov.org', 'coord.cafe.haifa2@shachentov.org'],
  },
]

const DEFAULT_PASSWORD = 'Shachentov2025!'

async function getOrCreateUser(email: string): Promise<string> {
  try {
    const user = await auth.getUserByEmail(email)
    console.log(`  ↩ user exists: ${email} (${user.uid})`)
    return user.uid
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      const newUser = await auth.createUser({
        email,
        password: DEFAULT_PASSWORD,
        displayName: email.split('@')[0].replace(/\./g, ' '),
        emailVerified: false,
      })
      console.log(`  ✓ created user: ${email} (${newUser.uid})`)
      return newUser.uid
    }
    throw err
  }
}

async function main() {
  console.log('=== Seeding Shachentov coordinator data ===\n')

  for (const seed of BRANCHES) {
    console.log(`Branch: ${seed.name} (${seed.city}, ${seed.type})`)

    const uids: string[] = []
    for (const email of seed.coordinatorEmails) {
      const uid = await getOrCreateUser(email)
      uids.push(uid)

      // Upsert users/{uid} Firestore doc
      await db.collection('users').doc(uid).set(
        {
          email,
          name: email.split('@')[0].replace(/\./g, ' '),
          role: 'coordinator',
        },
        { merge: true }
      )
    }

    // Upsert branches document — use branch name as stable lookup key
    const branchesRef = db.collection('branches')
    const existing = await branchesRef.where('name', '==', seed.name).limit(1).get()

    if (!existing.empty) {
      const docRef = existing.docs[0].ref
      await docRef.update({
        coordinatorUids: FieldValue.arrayUnion(...uids),
        city: seed.city,
        type: seed.type,
      })

      // Update each coordinator's Firestore doc with this branchId
      for (const uid of uids) {
        await db.collection('users').doc(uid).set({ branchId: docRef.id }, { merge: true })
      }

      console.log(`  ↩ branch exists (${docRef.id}), updated coordinatorUids\n`)
    } else {
      const docRef = await branchesRef.add({
        name: seed.name,
        city: seed.city,
        type: seed.type,
        coordinatorUids: uids,
        createdAt: FieldValue.serverTimestamp(),
      })

      for (const uid of uids) {
        await db.collection('users').doc(uid).set({ branchId: docRef.id }, { merge: true })
      }

      console.log(`  ✓ branch created (${docRef.id})\n`)
    }
  }

  console.log('=== Done ===')
  console.log(`Default password for all new users: ${DEFAULT_PASSWORD}`)
  console.log('Remember to set passwords via Firebase Console before handing credentials to coordinators.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
