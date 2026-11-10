import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

/**
 * Opens (or repairs) an HQ person's e-mail login and sets its password — the
 * person's phone number unless another one is given. Needs the Admin SDK: the
 * login must carry the same id as the person's record, and only the server can
 * set someone else's password. Callable by system managers only.
 */

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const fail = (statusCode: number, error: string) => ({ statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error }) })

const MANAGER_ROLES = ['admin', 'CEO']
const NO_STAFF_LOGIN = ['', 'coordinator', 'none']

interface PersonDoc { name?: string; email?: string; phone?: string; role?: string; active?: boolean }

const errorCode = (err: unknown) => (err as { code?: string }).code ?? ''

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return fail(405, 'Method Not Allowed')

  const authHeader = event.headers['authorization'] ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return fail(401, 'לא מחובר — התחבר מחדש ונסה שוב.')

  try { initFirebase() } catch {
    return fail(500, 'משתנה הסביבה FIREBASE_SERVICE_ACCOUNT חסר או שגוי ב-Netlify.')
  }

  let callerUid: string
  try {
    callerUid = (await getAuth().verifyIdToken(idToken)).uid
  } catch {
    return fail(401, 'ההתחברות פגה — רענן את הדף והתחבר מחדש.')
  }

  const db = getFirestore()
  const auth = getAuth()

  const callerSnap = await db.collection('users').doc(callerUid).get()
  const caller = (callerSnap.data() ?? {}) as PersonDoc
  if (!callerSnap.exists || caller.active === false || !MANAGER_ROLES.includes(caller.role ?? '')) {
    return fail(403, 'רק מנהל/ת מערכת רשאי/ת לנהל כניסות וסיסמאות.')
  }

  const { personId, password } = JSON.parse(event.body ?? '{}') as { personId?: string; password?: string }
  if (!personId) return fail(400, 'חסר מזהה אדם.')

  const personSnap = await db.collection('users').doc(personId).get()
  if (!personSnap.exists) return fail(404, 'האדם לא נמצא.')
  const person = personSnap.data() as PersonDoc

  if (NO_STAFF_LOGIN.includes(person.role ?? '')) return fail(400, 'לאדם זה אין גישת מטה, ולכן אין לו סיסמה.')
  const email = (person.email ?? '').trim().toLowerCase()
  if (!email || email.endsWith('.internal')) return fail(400, 'חסרה כתובת אימייל לכניסה.')
  const newPassword = (password ?? '').trim() || (person.phone ?? '').replace(/\D/g, '')
  if (newPassword.length < 6) return fail(400, 'נדרש מספר טלפון (6 ספרות לפחות) כדי לקבוע סיסמה.')

  try {
    let exists = true
    try {
      await auth.getUser(personId)
    } catch (err) {
      if (errorCode(err) !== 'auth/user-not-found') throw err
      exists = false
    }
    if (exists) {
      await auth.updateUser(personId, { email, password: newPassword, displayName: person.name, disabled: false })
    } else {
      await auth.createUser({ uid: personId, email, password: newPassword, displayName: person.name })
    }
  } catch (err) {
    if (errorCode(err) === 'auth/email-already-exists') {
      return fail(409, 'כתובת האימייל כבר רשומה לכניסה של משתמש אחר.')
    }
    if (errorCode(err) === 'auth/invalid-email') return fail(400, 'כתובת האימייל אינה תקינה.')
    return fail(500, `שגיאה בהגדרת הכניסה: ${err instanceof Error ? err.message : String(err)}`)
  }

  await db.collection('userSecrets').doc(personId).set({
    password: newPassword,
    setBy: callerUid,
    setAt: FieldValue.serverTimestamp(),
  })

  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ password: newPassword }) }
}
