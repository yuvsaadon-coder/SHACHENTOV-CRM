/**
 * One-time seed endpoint — creates all branches, coordinators, and operational data.
 * Protected by SEED_SECRET env var (set in Netlify → Environment Variables).
 * POST { secret: "..." }
 */
import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

function digitsOnly(s: string) { return s.replace(/\D/g, '') }

interface CoordSeed { name: string; phone: string }

interface BranchSeed {
  name: string
  city: string
  type: 'food' | 'cafe_youth'
  coordinators: CoordSeed[]
  distributionFrequency?: string
  distributionDay?: string
  weeklyBaskets?: number
  monthlyBaskets?: number
  packagingTime?: string
  distributionTime?: string
  address?: string
}

const BRANCHES: BranchSeed[] = [
  {
    name: 'סלי מזון - בית שמש',
    city: 'בית שמש', type: 'food',
    coordinators: [
      { name: 'רושי פרידמן', phone: '052-7320074' },
      { name: 'מאיר פרידמן', phone: '052-3477913' },
    ],
  },
  {
    name: 'סלי מזון - תל אביב',
    city: 'תל אביב', type: 'food',
    coordinators: [{ name: 'ורד רבינוביץ', phone: '054-4423118' }],
  },
  {
    name: 'סלי מזון - קדימה',
    city: 'קדימה', type: 'food',
    coordinators: [{ name: 'גלית שפירא', phone: '050-7113617' }],
  },
  {
    name: 'סלי מזון - טבריה',
    city: 'טבריה', type: 'food',
    coordinators: [
      { name: 'רן שרון', phone: '054-6432281' },
      { name: 'שירה שרון', phone: '054-6432281' },
    ],
  },
  {
    name: 'סלי מזון - צפת',
    city: 'צפת', type: 'food',
    coordinators: [
      { name: 'רותי בן הרוש', phone: '052-4409349' },
      { name: 'דוד בן הרוש',  phone: '052-4409349' },
    ],
  },
  {
    name: 'סלי מזון - ירושלים גילה',
    city: 'ירושלים', type: 'food',
    coordinators: [{ name: 'לאה ליבנת', phone: '054-9481122' }],
    distributionFrequency: 'פעם בשבועיים',
    distributionDay: 'שישי',
    weeklyBaskets: 57,
    monthlyBaskets: 114,
    packagingTime: '11:45–13:00',
    distributionTime: '10:45–13:30',
  },
  {
    name: 'סלי מזון - ירושלים רמות',
    city: 'ירושלים', type: 'food',
    coordinators: [
      { name: 'יאיר יעקבי', phone: '058-4466127' },
      { name: 'סיגל דאדי',  phone: '052-3220656' },
    ],
    distributionFrequency: 'כל שבוע',
    distributionDay: 'שישי',
    weeklyBaskets: 41,
    monthlyBaskets: 164,
    packagingTime: '8:45–10:00',
    distributionTime: '10:30–12:00',
  },
  {
    name: 'סלי מזון - ירושלים בקעה',
    city: 'ירושלים', type: 'food',
    coordinators: [
      { name: 'שירה גולדברג', phone: '058-4650964' },
      { name: 'שירי תהילה',  phone: '053-9351712' },
    ],
    distributionFrequency: 'כל שבוע',
    distributionDay: 'שישי',
    weeklyBaskets: 61,
    monthlyBaskets: 244,
    packagingTime: '12:00–13:00',
    distributionTime: '12:00–14:00',
  },
  {
    name: 'סלי מזון - ירושלים נחלאות',
    city: 'ירושלים', type: 'food',
    coordinators: [
      { name: 'הדס צויבל', phone: '052-8990130' },
      { name: 'עוז בינר',  phone: '052-3763246' },
    ],
    distributionFrequency: 'פעם בשבועיים',
    distributionDay: 'חמישי',
    weeklyBaskets: 41,
    monthlyBaskets: 82,
    packagingTime: '19:00',
    distributionTime: '19:30',
  },
  {
    name: 'סלי מזון - ירושלים קרית יובל',
    city: 'ירושלים', type: 'food',
    coordinators: [
      { name: 'יהונתן אלבז',     phone: '052-3855335' },
      { name: 'אלישי בר טימור',  phone: '050-6507936' },
      { name: 'יהודית רוטקוביץ', phone: '052-8836428' },
      { name: 'דב קראוס',        phone: '055-2565964' },
    ],
    distributionFrequency: 'כל שבוע',
    distributionDay: 'שישי',
    weeklyBaskets: 41,
    monthlyBaskets: 164,
    packagingTime: '07:00',
    distributionTime: '10:00',
  },
  {
    name: 'סלי מזון - ירושלים קטמון',
    city: 'ירושלים', type: 'food',
    coordinators: [
      { name: 'ציפי זלמנוביץ', phone: '050-2114502' },
      { name: 'אביטל עזיז',    phone: '054-7993453' },
      { name: 'אסתי בראור',    phone: '050-7691577' },
      { name: 'כרמל קרופפלד',  phone: '054-6954475' },
    ],
    distributionFrequency: 'כל שבוע',
    distributionDay: 'שישי',
    weeklyBaskets: 50,
    monthlyBaskets: 200,
    packagingTime: '09:00',
    distributionTime: '10:30–11:30',
  },
  {
    name: 'סלי מזון - ירושלים נווה יעקב',
    city: 'ירושלים', type: 'food',
    coordinators: [{ name: 'נעמי', phone: '052-3301495' }],
    distributionFrequency: 'פעם בשבועיים',
    distributionDay: 'משתנה',
    weeklyBaskets: 30,
    monthlyBaskets: 60,
  },
  {
    name: 'מועדון נוער - פסגת זאב',
    city: 'ירושלים', type: 'cafe_youth',
    coordinators: [{ name: 'אבי שרעבי', phone: '050-2603396' }],
  },
]

async function getOrCreateAuthUser(auth: ReturnType<typeof getAuth>, coord: CoordSeed): Promise<string> {
  const email = `${digitsOnly(coord.phone)}@coord.shachentov.internal`
  try {
    const existing = await auth.getUserByEmail(email)
    return existing.uid
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'auth/user-not-found') {
      const newUser = await auth.createUser({
        email,
        password: `CT_${digitsOnly(coord.phone)}_ST`,
        displayName: coord.name,
        emailVerified: false,
      })
      return newUser.uid
    }
    throw e
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const { secret } = JSON.parse(event.body ?? '{}') as { secret?: string }
  const expected = process.env.SEED_SECRET
  if (!expected || secret !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized — check your SEED_SECRET' }) }
  }

  try { initFirebase() } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Firebase not configured (FIREBASE_SERVICE_ACCOUNT missing)' }) }
  }

  const auth = getAuth()
  const db = getFirestore()
  const log: string[] = []

  for (const seed of BRANCHES) {
    const uids: string[] = []
    const names: string[] = []

    for (const coord of seed.coordinators) {
      const uid = await getOrCreateAuthUser(auth, coord)
      uids.push(uid)
      names.push(coord.name)
      await db.collection('users').doc(uid).set(
        { uid, name: coord.name, phone: coord.phone, role: 'coordinator', active: true },
        { merge: true }
      )
    }

    const opData: Record<string, unknown> = {
      coordinatorUids: uids,
      coordinatorNames: names,
      city: seed.city,
      type: seed.type,
    }
    if (seed.distributionFrequency) opData.distributionFrequency = seed.distributionFrequency
    if (seed.distributionDay)       opData.distributionDay = seed.distributionDay
    if (seed.weeklyBaskets != null)  opData.weeklyBaskets = seed.weeklyBaskets
    if (seed.monthlyBaskets != null) opData.monthlyBaskets = seed.monthlyBaskets
    if (seed.packagingTime)          opData.packagingTime = seed.packagingTime
    if (seed.distributionTime)       opData.distributionTime = seed.distributionTime
    if (seed.address)                opData.address = seed.address

    const existing = await db.collection('branches').where('name', '==', seed.name).limit(1).get()
    if (!existing.empty) {
      await existing.docs[0].ref.update(opData)
      log.push(`↩ ${seed.name} (updated)`)
    } else {
      await db.collection('branches').add({
        ...opData,
        name: seed.name,
        createdAt: FieldValue.serverTimestamp(),
      })
      log.push(`✓ ${seed.name} (created)`)
    }

    for (const uid of uids) {
      const branchSnap = await db.collection('branches').where('name', '==', seed.name).limit(1).get()
      if (!branchSnap.empty) {
        await db.collection('users').doc(uid).set({ branchId: branchSnap.docs[0].id }, { merge: true })
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, seeded: log }),
  }
}
