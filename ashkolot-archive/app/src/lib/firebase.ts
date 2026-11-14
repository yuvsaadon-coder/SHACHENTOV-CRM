import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { connectAuthEmulator, getAuth, GoogleAuthProvider, OAuthProvider, signInWithCredential, signInWithPopup, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const env = import.meta.env

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const isConfigured = Boolean(config.apiKey && config.projectId)

export const app = initializeApp(isConfigured ? config : { apiKey: 'missing', projectId: 'missing', appId: 'missing' })

// App Check: חוסם קריאות ל-Firestore/Storage שלא מגיעות מהאפליקציה עצמה (אופציונלי, מומלץ בפרודקשן)
if (isConfigured && env.VITE_RECAPTCHA_ENTERPRISE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)
auth.languageCode = 'he'
export const db = getFirestore(app)
export const storage = getStorage(app)

// פיתוח מקומי בלבד: חיבור לאמולטורים. הקוד הזה נמחק מבניית פרודקשן (הדגל מוחלף בזמן הבנייה).
export const useEmulators = env.VITE_USE_EMULATORS === 'true'
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
}

/** כניסת פיתוח מול אמולטור האימות (בלי Google אמיתי) */
export async function devSignIn(email: string) {
  if (!useEmulators) throw new Error('dev sign-in is only available with emulators')
  const token = JSON.stringify({ sub: email, email, email_verified: true })
  await signInWithCredential(auth, GoogleAuthProvider.credential(token))
}

export const microsoftEnabled = env.VITE_ENABLE_MICROSOFT === 'true'

export async function signInGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(auth, provider)
}

export async function signInMicrosoft() {
  const provider = new OAuthProvider('microsoft.com')
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(auth, provider)
}

export function logout() {
  return signOut(auth)
}
