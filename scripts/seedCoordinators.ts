/**
 * Seed script: creates real coordinator users from the organization's contact list.
 * displayName = Hebrew name, password = phone digits only.
 * Idempotent: skips existing auth users, updates coordinatorUids in branch docs.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' npx ts-node scripts/seedCoordinators.ts
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

function phoneToPassword(phone: string): string {
  return phone.replace(/\D/g, '')
}

interface CoordinatorSeed {
  name: string
  email: string
  phone: string
}

interface BranchSeed {
  name: string
  city: string
  type: 'food' | 'cafe_youth'
  coordinators: CoordinatorSeed[]
}

const BRANCHES: BranchSeed[] = [
  {
    name: 'סלי מזון - בית שמש',
    city: 'בית שמש',
    type: 'food',
    coordinators: [
      { name: 'רושי פרידמן',  email: 'roshi.friedman@shachentov.org',   phone: '052-7320074' },
      { name: 'מאיר פרידמן',  email: 'meir.friedman@shachentov.org',    phone: '052-3477913' },
    ],
  },
  {
    name: 'סלי מזון - תל אביב',
    city: 'תל אביב',
    type: 'food',
    coordinators: [
      { name: 'ורד רבינוביץ', email: 'vered.rabinovitz@shachentov.org', phone: '054-4423118' },
    ],
  },
  {
    name: 'סלי מזון - קדימה',
    city: 'קדימה',
    type: 'food',
    coordinators: [
      { name: 'גלית שפירא',   email: 'galit.shapira@shachentov.org',    phone: '050-711-3617' },
    ],
  },
  {
    name: 'סלי מזון - טבריה',
    city: 'טבריה',
    type: 'food',
    coordinators: [
      { name: 'רן שרון',      email: 'ran.sharon@shachentov.org',       phone: '054-6432281' },
      { name: 'שירה שרון',    email: 'shira.sharon@shachentov.org',     phone: '054-6432281' },
    ],
  },
  {
    name: 'סלי מזון - צפת',
    city: 'צפת',
    type: 'food',
    coordinators: [
      { name: 'רותי בן הרוש', email: 'ruti.benharosh@shachentov.org',   phone: '052-440-9349' },
      { name: 'דוד בן הרוש',  email: 'david.benharosh@shachentov.org',  phone: '052-440-9349' },
    ],
  },
  {
    name: 'סלי מזון - ירושלים גילה',
    city: 'ירושלים',
    type: 'food',
    coordinators: [
      { name: 'לאה ליבנת',    email: 'leah.livnat@shachentov.org',      phone: '054-948-1122' },
    ],
  },
  {
    name: 'סלי מזון - ירושלים רמות',
    city: 'ירושלים',
    type: 'food',
    coordinators: [
      { name: 'יאיר יעקבי',   email: 'yair.yakobi@shachentov.org',      phone: '058-446-6127' },
      { name: 'סיגל דאדי',    email: 'sigal.dadi@shachentov.org',       phone: '052-322-0656' },
    ],
  },
  {
    name: 'סלי מזון - ירושלים בקעה',
    city: 'ירושלים',
    type: 'food',
    coordinators: [
      { name: 'שירה גולדברג', email: 'shira.goldberg@shachentov.org',   phone: '058-465-0964' },
      { name: 'שירי תהילה',   email: 'shiri.tehila@shachentov.org',     phone: '053-935-1712' },
    ],
  },
  {
    name: 'סלי מזון - ירושלים נחלאות',
    city: 'ירושלים',
    type: 'food',
    coordinators: [
      { name: 'הדס צויבל',    email: 'hadas.tzuibel@shachentov.org',    phone: '052-8990130' },
      { name: 'עוז בינר',     email: 'oz.biner@shachentov.org',         phone: '052-3763246' },
    ],
  },
  {
    name: 'סלי מזון - ירושלים קרית יובל',
    city: 'ירושלים',
    type: 'food',
    coordinators: [
      { name: 'יהונתן אלבז',      email: 'yonatan.elbaz@shachentov.org',     phone: '052-385-5335' },
      { name: 'אלישי בר טימור',   email: 'elishi.bartimor@shachentov.org',   phone: '050-650-7936' },
      { name: 'יהודית רוטקוביץ',  email: 'yehudit.rotkovitz@shachentov.org', phone: '052-883-6428' },
      { name: 'דב קראוס',         email: 'dov.kraus@shachentov.org',         phone: '055-256-5964' },
    ],
  },
  {
    name: 'סלי מזון - ירושלים קטמון',
    city: 'ירושלים',
    type: 'food',
    coordinators: [
      { name: 'ציפי זלמנוביץ',  email: 'tzipi.zalmanowitz@shachentov.org', phone: '050-2114502' },
      { name: 'אביטל עזיז',     email: 'avital.aziz@shachentov.org',       phone: '054-7993453' },
      { name: 'אסתי בראור',     email: 'esti.brauer@shachentov.org',       phone: '050-7691577' },
      { name: 'כרמל קרופפלד',   email: 'carmel.kropfeld@shachentov.org',   phone: '054-6954475' },
    ],
  },
  {
    name: 'סלי מזון - ירושלים נווה יעקב',
    city: 'ירושלים',
    type: 'food',
    coordinators: [
      { name: 'נעמי',          email: 'naomi@shachentov.org',            phone: '052-3301495' },
    ],
  },
  {
    name: 'מועדון נוער - פסגת זאב',
    city: 'ירושלים',
    type: 'cafe_youth',
    coordinators: [
      { name: 'אבי שרעבי',    email: 'avi.sharabi@shachentov.org',      phone: '050-2603396' },
    ],
  },
]

// Internal email derived from phone digits — coordinators never see this
function internalEmail(phone: string): string {
  return `${phoneToPassword(phone)}@coord.shachentov.internal`
}

async function getOrCreateUser(coord: CoordinatorSeed): Promise<string> {
  const email = internalEmail(coord.phone)
  // Use a stable dummy password — login is via custom token (name + phone), not email/password
  const dummyPassword = `CT_${phoneToPassword(coord.phone)}_ST`
  try {
    const existing = await auth.getUserByEmail(email)
    console.log(`  ↩ קיים: ${coord.name} (${existing.uid})`)
    return existing.uid
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      const newUser = await auth.createUser({
        email,
        password: dummyPassword,
        displayName: coord.name,
        emailVerified: false,
      })
      console.log(`  ✓ נוצר: ${coord.name}`)
      return newUser.uid
    }
    throw err
  }
}

async function main() {
  console.log('=== Seeding שכן טוב coordinators ===\n')

  for (const seed of BRANCHES) {
    console.log(`סניף: ${seed.name} (${seed.city})`)

    const uids: string[] = []
    for (const coord of seed.coordinators) {
      const uid = await getOrCreateUser(coord)
      uids.push(uid)

      await db.collection('users').doc(uid).set(
        {
          name: coord.name,
          phone: coord.phone,
          role: 'coordinator',
        },
        { merge: true }
      )
    }

    const branchesRef = db.collection('branches')
    const existing = await branchesRef.where('name', '==', seed.name).limit(1).get()

    if (!existing.empty) {
      const docRef = existing.docs[0].ref
      await docRef.update({
        coordinatorUids: FieldValue.arrayUnion(...uids),
        city: seed.city,
        type: seed.type,
      })
      for (const uid of uids) {
        await db.collection('users').doc(uid).set({ branchId: docRef.id }, { merge: true })
      }
      console.log(`  ↩ סניף קיים (${docRef.id}), עודכן\n`)
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
      console.log(`  ✓ סניף נוצר (${docRef.id})\n`)
    }
  }

  console.log('=== סיום ===')
  console.log('כניסה לפורטל: שם מלא + מספר טלפון (בכתובת /portal/login)')
  process.exit(0)
}

main().catch((err) => {
  console.error('שגיאה:', err)
  process.exit(1)
})
