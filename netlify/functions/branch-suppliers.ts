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

interface Supplier { name?: string; categories?: string[]; contactName?: string; phone?: string; email?: string; websiteUrl?: string; logoUrl?: string; status?: string; active?: boolean; branchIds?: string[]; contactIds?: string[] }
interface Partner { name?: string; partnerType?: string; websiteUrl?: string; logoUrl?: string; status?: string; active?: boolean; branchIds?: string[]; contactIds?: string[]; externalContactId?: string }
interface ContactDoc { name?: string; phone?: string; email?: string; role?: string; organization?: string }

/** The only contact fields a coordinator may see. */
function publicContact(c: ContactDoc) {
  return { name: c.name ?? '', phone: c.phone || undefined, email: c.email || undefined, role: c.role || undefined, organization: c.organization || undefined }
}

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

  const supplierDocs = sSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Supplier) })).filter((s) => s.active !== false)
  const partnerDocs = pSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Partner) })).filter((p) => p.active !== false)

  const contactIdsOf = (ids: (string | undefined)[]) => [...new Set(ids.filter((x): x is string => !!x))]
  const wanted = contactIdsOf([
    ...supplierDocs.flatMap((s) => s.contactIds ?? []),
    ...partnerDocs.flatMap((p) => [p.externalContactId, ...(p.contactIds ?? [])]),
  ])
  const contactSnaps = await Promise.all(wanted.map((id) => db.collection('contacts').doc(id).get()))
  const contactById = new Map(contactSnaps.filter((c) => c.exists).map((c) => [c.id, publicContact(c.data() as ContactDoc)]))
  const contactsFor = (ids: (string | undefined)[]) =>
    contactIdsOf(ids).map((id) => contactById.get(id)).filter((c): c is ReturnType<typeof publicContact> => !!c)

  const suppliers = supplierDocs.map((s) => ({
    id: s.id, name: s.name ?? '', categories: s.categories ?? [], contactName: s.contactName, phone: s.phone, email: s.email,
    websiteUrl: s.websiteUrl, logoUrl: s.logoUrl, status: s.status, contacts: contactsFor(s.contactIds ?? []),
  }))
  const partners = partnerDocs.map((p) => ({
    id: p.id, name: p.name ?? '', partnerType: p.partnerType, websiteUrl: p.websiteUrl, logoUrl: p.logoUrl, status: p.status,
    contacts: contactsFor([p.externalContactId, ...(p.contactIds ?? [])]),
  }))

  return reply(200, { suppliers, partners })
}
