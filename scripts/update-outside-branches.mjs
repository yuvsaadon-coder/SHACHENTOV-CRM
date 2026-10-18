/**
 * Updates address + distributionTime for outside food branches
 * based on website data (Oct 2026).
 * Usage: node scripts/update-outside-branches.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'

const SA = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/be4bca96-shachentov-crm-firebase-adminsdk-fbsvc-5379520156.json'
if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(SA, 'utf8'))) })
const db = getFirestore()

const UPDATES = [
  {
    id: 'H7yNEhEOd1Ys3xu1MB1P', // סלי מזון - קדימה
    address: 'סניף בני עקיבא, קדימה',
    distributionTime: 'יום שלישי | אריזה 18:00 | חלוקה 19:00',
  },
  {
    id: 'hnFr5Oeqgmry0pUogMpf', // סלי מזון - תל אביב
    address: 'סניף בני עקיבא, תל אביב',
    distributionTime: 'יום חמישי | אריזה 16:00 | חלוקה 17:00–19:00',
  },
  {
    id: 'qRZW1FWSN5UEv1T1mrJY', // סלי מזון - צפת
    address: 'מבית משפחת בן הרוש, צפת',
    distributionTime: 'יום חמישי | אריזה 18:00',
  },
  {
    id: 'QhMuMyFbr9U7NkutMleB', // סלי מזון - טבריה
    address: 'רחוב הכלנית 5, טבריה',
    distributionTime: "יום ה': אריזה 18:00 | חלוקה 19:00  |  יום ו': אריזה 10:00 | חלוקה 11:00",
  },
  {
    id: 'gjcfSzrQl95x1wGEC9Vi', // סלי מזון - בית שמש
    address: 'בית שמש',
    distributionTime: 'יום חמישי (אחת לשבועיים) | אריזה 19:00',
  },
]

async function main() {
  console.log('=== Updating outside branches ===\n')
  for (const { id, address, distributionTime } of UPDATES) {
    const ref = db.collection('branches').doc(id)
    const snap = await ref.get()
    if (!snap.exists) { console.log(`⚠ ${id} not found`); continue }
    await ref.update({ address, distributionTime })
    console.log(`✓ ${snap.data().name}`)
    console.log(`  כתובת: ${address}`)
    console.log(`  זמן: ${distributionTime}\n`)
  }
  console.log('Done.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
