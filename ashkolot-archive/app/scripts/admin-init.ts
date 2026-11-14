// אתחול Firebase Admin לסקריפטי התקנה. דורש מפתח חשבון שירות:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
// את המפתח מורידים מ-Firebase Console > Project settings > Service accounts.
// לעולם לא לשמור אותו בתוך הריפו (הוא מוחרג ב-.gitignore).

import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

export function initAdmin() {
  const projectId = arg('project') ?? process.env.FIREBASE_PROJECT_ID
  const bucket = arg('bucket') ?? process.env.FIREBASE_STORAGE_BUCKET ?? (projectId ? `${projectId}.firebasestorage.app` : undefined)
  if (!projectId) throw new Error('חסר --project <project-id> (או FIREBASE_PROJECT_ID)')
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error('חסר GOOGLE_APPLICATION_CREDENTIALS (נתיב לקובץ חשבון השירות)')
  const app = initializeApp({ credential: applicationDefault(), projectId, storageBucket: bucket })
  return { db: getFirestore(app), bucket: getStorage(app).bucket(), projectId }
}
