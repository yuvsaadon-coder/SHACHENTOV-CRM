import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { corsHeaders, handleOptions } from './_cors'
import { canAccessBranch } from './_branchAuth'
import { validateOps } from './_branchOps'

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

/** A coordinator updates the operational data of a branch they coordinate. HQ sees it live: same document. */
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
  if (!idToken) return reply(401, { error: 'לא מחובר — התחבר מחדש ונסה שוב.' })

  try { initFirebase() } catch { return reply(500, { error: 'Server configuration error' }) }

  let uid: string
  try { uid = (await getAuth().verifyIdToken(idToken)).uid } catch { return reply(401, { error: 'ההתחברות פגה — רענן ונסה שוב.' }) }

  const { branchId, fields } = JSON.parse(event.body ?? '{}') as { branchId?: string; fields?: unknown }
  if (!branchId) return reply(400, { error: 'חסר סניף' })

  const db = getFirestore()
  if (!(await canAccessBranch(db, uid, branchId))) return reply(403, { error: 'אין הרשאה לעדכן את הסניף הזה.' })

  const checked = validateOps(fields)
  if (!checked.ok) return reply(400, { error: checked.error })

  const ref = db.collection('branches').doc(branchId)
  if (!(await ref.get()).exists) return reply(404, { error: 'הסניף לא נמצא.' })

  await ref.update({ ...checked.update, opsUpdatedAt: FieldValue.serverTimestamp(), opsUpdatedBy: uid })
  return reply(200, { ok: true })
}
