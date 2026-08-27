import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase/client'
import type {
  Profile,
  Organization,
  Program,
  Cohort,
  Enrollment,
  FormDefinition,
  FormSubmission,
  Segment,
  BroadcastLog,
  AppUser,
  SegmentQuery,
  SegmentCondition,
} from '@/types/crm'
import { generateProfileId, generateOrgId } from './utils'

// ─── Collection references ────────────────────────────────────────────────────

export const Collections = {
  profiles: 'profiles',
  organizations: 'organizations',
  programs: 'programs',
  cohorts: (programId: string) => `programs/${programId}/cohorts`,
  enrollments: 'enrollments',
  forms: 'forms',
  submissions: (formId: string) => `forms/${formId}/submissions`,
  segments: 'segments',
  broadcasts: 'broadcasts',
  users: 'users',
} as const

// ─── Profiles ────────────────────────────────────────────────────────────────

export async function createProfile(data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>) {
  const id = generateProfileId()
  const profileRef = doc(db, Collections.profiles, id)
  await setDoc(profileRef, {
    ...data,
    id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return id
}

export async function updateProfile(id: string, data: Partial<Profile>) {
  const profileRef = doc(db, Collections.profiles, id)
  await updateDoc(profileRef, { ...data, updatedAt: serverTimestamp() })
}

export async function getProfile(id: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, Collections.profiles, id))
  if (!snap.exists()) return null
  return snap.data() as Profile
}

export async function getAllProfiles(): Promise<Profile[]> {
  const snap = await getDocs(
    query(collection(db, Collections.profiles), orderBy('lastName'))
  )
  return snap.docs.map(d => d.data() as Profile)
}

export function subscribeProfiles(
  callback: (profiles: Profile[]) => void,
  constraints: QueryConstraint[] = []
) {
  const q = query(collection(db, Collections.profiles), ...constraints)
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => d.data() as Profile))
  })
}

// ─── Organizations ────────────────────────────────────────────────────────────

export async function createOrganization(
  data: Omit<Organization, 'id' | 'createdAt'>
): Promise<string> {
  const id = generateOrgId()
  await setDoc(doc(db, Collections.organizations, id), {
    ...data,
    id,
    createdAt: serverTimestamp(),
  })
  return id
}

export async function getAllOrganizations(): Promise<Organization[]> {
  const snap = await getDocs(
    query(collection(db, Collections.organizations), orderBy('name'))
  )
  return snap.docs.map(d => d.data() as Organization)
}

// ─── Programs & Cohorts ───────────────────────────────────────────────────────

export async function getPrograms(): Promise<Program[]> {
  const snap = await getDocs(collection(db, Collections.programs))
  return snap.docs.map(d => d.data() as Program)
}

export async function getCohorts(programId: string): Promise<Cohort[]> {
  const snap = await getDocs(
    query(collection(db, Collections.cohorts(programId)), orderBy('label'))
  )
  return snap.docs.map(d => d.data() as Cohort)
}

export async function getAllCohorts(): Promise<Cohort[]> {
  const programs = await getPrograms()
  const all: Cohort[] = []
  for (const p of programs) {
    const cohorts = await getCohorts(p.id)
    all.push(...cohorts)
  }
  return all
}

// ─── Enrollments ─────────────────────────────────────────────────────────────

export async function createEnrollment(
  data: Omit<Enrollment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, Collections.enrollments), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(ref, { id: ref.id })
  return ref.id
}

export async function updateEnrollment(id: string, data: Partial<Enrollment>) {
  await updateDoc(doc(db, Collections.enrollments, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function getEnrollmentsByCohort(cohortId: string): Promise<Enrollment[]> {
  const snap = await getDocs(
    query(
      collection(db, Collections.enrollments),
      where('cohortId', '==', cohortId),
      orderBy('updatedAt', 'desc')
    )
  )
  return snap.docs.map(d => d.data() as Enrollment)
}

export async function getEnrollmentsByProfile(profileId: string): Promise<Enrollment[]> {
  const snap = await getDocs(
    query(
      collection(db, Collections.enrollments),
      where('profileId', '==', profileId),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs.map(d => d.data() as Enrollment)
}

export function subscribeEnrollments(
  cohortId: string,
  callback: (enrollments: Enrollment[]) => void
) {
  const q = query(
    collection(db, Collections.enrollments),
    where('cohortId', '==', cohortId),
    orderBy('updatedAt', 'desc')
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => d.data() as Enrollment))
  })
}

// ─── Forms ────────────────────────────────────────────────────────────────────

export async function createForm(
  data: Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, Collections.forms), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(ref, { id: ref.id })
  return ref.id
}

export async function updateForm(id: string, data: Partial<FormDefinition>) {
  await updateDoc(doc(db, Collections.forms, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function getFormById(id: string): Promise<FormDefinition | null> {
  const snap = await getDoc(doc(db, Collections.forms, id))
  if (!snap.exists()) return null
  return snap.data() as FormDefinition
}

export async function getFormByToken(token: string): Promise<FormDefinition | null> {
  const snap = await getDocs(
    query(
      collection(db, Collections.forms),
      where('publicToken', '==', token),
      where('isActive', '==', true),
      limit(1)
    )
  )
  if (snap.empty) return null
  return snap.docs[0].data() as FormDefinition
}

export async function getForms(): Promise<FormDefinition[]> {
  const snap = await getDocs(
    query(collection(db, Collections.forms), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => d.data() as FormDefinition)
}

export async function createSubmission(
  formId: string,
  data: Omit<FormSubmission, 'id'>
): Promise<string> {
  const ref = await addDoc(
    collection(db, Collections.submissions(formId)),
    data
  )
  await updateDoc(ref, { id: ref.id })
  return ref.id
}

// ─── Segments ─────────────────────────────────────────────────────────────────

export async function createSegment(
  data: Omit<Segment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, Collections.segments), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(ref, { id: ref.id })
  return ref.id
}

export async function updateSegment(id: string, data: Partial<Segment>) {
  await updateDoc(doc(db, Collections.segments, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function getSegments(): Promise<Segment[]> {
  const snap = await getDocs(
    query(collection(db, Collections.segments), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => d.data() as Segment)
}

// ─── Broadcasts ───────────────────────────────────────────────────────────────

export async function createBroadcast(
  data: Omit<BroadcastLog, 'id'>
): Promise<string> {
  const ref = await addDoc(collection(db, Collections.broadcasts), data)
  await updateDoc(ref, { id: ref.id })
  return ref.id
}

export async function getBroadcasts(): Promise<BroadcastLog[]> {
  const snap = await getDocs(
    query(collection(db, Collections.broadcasts), orderBy('dispatchedAt', 'desc'))
  )
  return snap.docs.map(d => d.data() as BroadcastLog)
}

// ─── In-memory segment query evaluation ──────────────────────────────────────

function evaluateCondition(
  profile: Profile & { enrollments?: Enrollment[] },
  condition: SegmentCondition
): boolean {
  const rawValue = (profile as DocumentData)[condition.field]
  const value = rawValue

  switch (condition.operator) {
    case 'equals':
      return value === condition.value
    case 'not_equals':
      return value !== condition.value
    case 'contains':
      if (Array.isArray(value)) {
        return value.some(v =>
          String(v).includes(String(condition.value))
        )
      }
      return String(value ?? '').includes(String(condition.value ?? ''))
    case 'in':
      if (Array.isArray(condition.value)) {
        if (Array.isArray(value)) {
          return value.some(v => (condition.value as string[]).includes(v))
        }
        return (condition.value as string[]).includes(value)
      }
      return false
    case 'not_in':
      if (Array.isArray(condition.value)) {
        return !(condition.value as string[]).includes(value)
      }
      return true
    case 'greater_than':
      return Number(value) > Number(condition.value)
    case 'less_than':
      return Number(value) < Number(condition.value)
    case 'is_empty':
      return !value || (Array.isArray(value) && value.length === 0)
    case 'is_not_empty':
      return !!value && (!Array.isArray(value) || value.length > 0)
    default:
      return false
  }
}

export function evaluateSegmentQuery(
  profiles: Profile[],
  query: SegmentQuery
): Profile[] {
  return profiles.filter(profile => {
    const results = query.conditions.map(c => evaluateCondition(profile, c))
    if (query.logicalOperator === 'AND') return results.every(Boolean)
    return results.some(Boolean)
  })
}
