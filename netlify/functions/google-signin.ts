import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { corsHeaders, handleOptions } from './_cors'

/**
 * Account-linking endpoint for Google sign-in.
 *
 * Flow:
 *  1. Client signs in with Google popup → gets a Firebase ID token (UID = Google UID)
 *  2. Client POSTs the ID token here
 *  3. We verify it, look up the existing users/{uid} doc by email
 *  4. We return a custom token for the EXISTING UID
 *  5. Client signs in with that custom token → correct UID, full access
 */

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

const json = (cors: Record<string, string>, status: number, body: unknown) => ({
  statusCode: status,
  headers: { ...cors, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler: Handler = async (event) => {
  const origin = event.headers['origin']
  const cors = corsHeaders(origin)
  if (event.httpMethod === 'OPTIONS') return handleOptions(origin)
  if (event.httpMethod !== 'POST') return json(cors, 405, { error: 'Method not allowed' })

  try { initFirebase() } catch {
    return json(cors, 500, { error: 'Server error' })
  }

  const { idToken } = JSON.parse(event.body ?? '{}') as { idToken?: string }
  if (!idToken) return json(cors, 400, { error: 'Missing idToken' })

  const firebaseAuth = getAuth()
  const db = getFirestore()

  // Verify the Firebase ID token that the Google popup issued.
  // Firebase already validated the Google OAuth token when it issued this one,
  // so the email in the decoded token is trustworthy.
  let email: string
  try {
    const decoded = await firebaseAuth.verifyIdToken(idToken)
    // Only a Google-issued, verified e-mail may be linked to an existing person. Without
    // this, anyone could self-register an unverified password account under a staff
    // member's address and trade its token for that person's session.
    if (!decoded.email || decoded.email_verified !== true || decoded.firebase?.sign_in_provider !== 'google.com') {
      throw new Error('not a verified Google sign-in')
    }
    email = decoded.email.toLowerCase()
  } catch {
    return json(cors, 401, { error: 'Token לא תקף.' })
  }

  // Find the existing users document by email (case-insensitive normalised on write).
  const snap = await db.collection('users')
    .where('email', '==', email)
    .limit(1)
    .get()

  if (snap.empty) {
    // Try lowercase in case email was stored differently
    const snap2 = await db.collection('users')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get()
    if (snap2.empty) {
      return json(cors, 403, { error: 'כתובת האימייל אינה מורשית. פנה למנהל המערכת.' })
    }
    const customToken2 = await firebaseAuth.createCustomToken(snap2.docs[0].id)
    return json(cors, 200, { token: customToken2 })
  }

  const existingUid = snap.docs[0].id
  const customToken = await firebaseAuth.createCustomToken(existingUid)
  return json(cors, 200, { token: customToken })
}
