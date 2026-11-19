import type { HandlerEvent } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

export function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

export type HqAuth = { ok: true; db: Firestore; uid: string } | { ok: false; status: number; error: string }

/** The caller must be signed in and be HQ staff (not a coordinator, not without access). */
export async function requireHq(event: HandlerEvent): Promise<HqAuth> {
  const authHeader = event.headers['authorization'] ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return { ok: false, status: 401, error: 'לא מחובר — התחבר מחדש ונסה שוב.' }
  try { initFirebase() } catch { return { ok: false, status: 500, error: 'משתנה הסביבה FIREBASE_SERVICE_ACCOUNT חסר או שגוי.' } }
  let uid: string
  try { uid = (await getAuth().verifyIdToken(idToken)).uid } catch { return { ok: false, status: 401, error: 'ההתחברות פגה — רענן ונסה שוב.' } }
  const db = getFirestore()
  const caller = (await db.collection('users').doc(uid).get()).data() as { role?: string; active?: boolean } | undefined
  if (!caller || caller.active === false || ['', 'coordinator', 'none'].includes(caller.role ?? '')) return { ok: false, status: 403, error: 'אין הרשאה.' }
  return { ok: true, db, uid }
}
