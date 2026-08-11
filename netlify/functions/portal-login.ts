import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    initFirebase()
  } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) }
  }

  const { name, phone } = JSON.parse(event.body ?? '{}') as { name?: string; phone?: string }
  if (!name || !phone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing name or phone' }) }
  }

  const db = getFirestore()
  const snap = await db
    .collection('users')
    .where('name', '==', name.trim())
    .where('role', '==', 'coordinator')
    .limit(5)
    .get()

  if (snap.empty) {
    return { statusCode: 401, body: JSON.stringify({ error: 'שם לא נמצא' }) }
  }

  const inputDigits = digitsOnly(phone)
  const match = snap.docs.find((d) => {
    const stored = digitsOnly((d.data() as { phone?: string }).phone ?? '')
    return stored === inputDigits
  })

  if (!match) {
    return { statusCode: 401, body: JSON.stringify({ error: 'שם או טלפון שגויים' }) }
  }

  const token = await getAuth().createCustomToken(match.id)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }
}
