import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { corsHeaders, handleOptions } from './_cors'
import { canAccessBranch } from './_branchAuth'

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

interface Supplier { name?: string; categories?: string[]; contactName?: string; phone?: string; email?: string; websiteUrl?: string; status?: string; active?: boolean; branchIds?: string[] }
interface Partner { name?: string; partnerType?: string; websiteUrl?: string; status?: string; active?: boolean; branchIds?: string[] }

/** The suppliers and partners that serve one branch — only what a coordinator needs, never notes or payment data. */
export const handler: Handler = async (event) => {
  const origin = event.headers['origin']
  const cors = corsHeaders(origin)
  if (event.httpMethod === 'OPTIONS') return handleOptions(origin)
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' }

  const reply = (statusCode: number, body: unknown) => ({
    statusCode, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  const authHeader = event.headers['authorization'] ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return reply(401, { error: 'Missing token' })

  try { initFirebase() } catch { return reply(500, { error: 'Server configuration error' }) }

  let uid: string
  try { uid = (await getAuth().verifyIdToken(idToken)).uid } catch { return reply(401, { error: 'Invalid token' }) }

  const { branchId } = JSON.parse(event.body ?? '{}') as { branchId?: string }
  if (!branchId) return reply(400, { error: 'Missing branchId' })

  const db = getFirestore()
  if (!(await canAccessBranch(db, uid, branchId))) return reply(403, { error: 'Not authorized for this branch' })

  const [sSnap, pSnap] = await Promise.all([
    db.collection('hq_suppliers').where('branchIds', 'array-contains', branchId).get(),
    db.collection('hq_partners').where('branchIds', 'array-contains', branchId).get(),
  ])

  const suppliers = sSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Supplier) }))
    .filter((s) => s.active !== false)
    .map((s) => ({ id: s.id, name: s.name ?? '', categories: s.categories ?? [], contactName: s.contactName, phone: s.phone, email: s.email, websiteUrl: s.websiteUrl, status: s.status }))
  const partners = pSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Partner) }))
    .filter((p) => p.active !== false)
    .map((p) => ({ id: p.id, name: p.name ?? '', partnerType: p.partnerType, websiteUrl: p.websiteUrl, status: p.status }))

  return reply(200, { suppliers, partners })
}
