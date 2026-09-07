import { initializeApp, getApps, deleteApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { assertEmulatorEnvironment, PROJECT_ID } from './emulator-env'

assertEmulatorEnvironment()

function app() {
  return getApps()[0] ?? initializeApp({ projectId: PROJECT_ID })
}

export function adminDb() {
  return getFirestore(app())
}

export async function closeAdmin() {
  await Promise.all(getApps().map((a) => deleteApp(a)))
}

export async function createBrowserUser(uid: string, role: string, extra: Record<string, unknown> = {}) {
  const auth = getAuth(app())
  await deleteBrowserUser(uid)
  await auth.createUser({
    uid,
    email: `${uid}@requirements.invalid`,
    password: 'Password123!',
    displayName: uid,
  })
  await adminDb().collection('users').doc(uid).set({
    name: uid,
    email: `${uid}@requirements.invalid`,
    role,
    active: true,
    ...extra,
  })
}

export async function deleteBrowserUser(uid: string) {
  try {
    await getAuth(app()).deleteUser(uid)
  } catch (error: unknown) {
    if (!String((error as { code?: string }).code ?? '').includes('user-not-found')) throw error
  }
  await adminDb().collection('users').doc(uid).delete()
}

export function stamp() {
  return FieldValue.serverTimestamp()
}

export function browserTask(uid: string, title: string, domain = 'JLM') {
  return {
    domain,
    category: 'בדיקות',
    title,
    steps: 'שלבי בדיקה',
    frequency: 'חד-פעמי',
    startDate: null,
    endDate: null,
    holidayAnchor: null,
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'לא בוצע',
    notes: '',
    createdAt: stamp(),
    updatedAt: stamp(),
    createdBy: uid,
    updatedBy: uid,
  }
}
