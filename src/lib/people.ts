import { collection, deleteField, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { AppUser, OrgRole, StoredOrgRole } from '../types'
import { DERIVED_ROLE_FIELDS } from '../types'
import {
  branchIdsFor, inputFromPerson, planPersonSave,
  type PersonInput, type PersonSavePlan,
} from './peopleLogic'

export interface OrgData {
  people: AppUser[]
  roles: OrgRole[]
}

type Batch = ReturnType<typeof writeBatch>

function applyPlan(batch: Batch, personId: string, isNew: boolean, plan: PersonSavePlan, skipRoleId?: string) {
  const ref = doc(db, 'users', personId)
  if (isNew) batch.set(ref, { ...plan.user, createdAt: serverTimestamp() })
  else batch.update(ref, { ...plan.user, updatedAt: serverTimestamp() })
  for (const s of plan.roleStatus) {
    if (s.roleId === skipRoleId) continue
    batch.update(doc(db, 'roles', s.roleId), { status: s.status, updatedAt: serverTimestamp() })
  }
  for (const c of plan.archive) {
    batch.set(doc(db, 'contacts', c.id), { ...c, endedAt: serverTimestamp(), createdBy: 'auto' })
  }
  for (const id of plan.unarchive) batch.delete(doc(db, 'contacts', id))
}

/** Create or update a person. The one write path for names, phones and who holds which position. */
export async function savePerson(personId: string | null, input: PersonInput, org: OrgData): Promise<string> {
  const id = personId ?? doc(collection(db, 'users')).id
  const prev = personId ? org.people.find((p) => p.uid === personId) ?? null : null
  const batch = writeBatch(db)
  applyPlan(batch, id, !prev, planPersonSave(id, prev, input, org.roles, new Date()))
  await batch.commit()
  return id
}

export async function assignRole(person: AppUser, roleId: string, org: OrgData) {
  const input = inputFromPerson(person)
  await savePerson(person.uid, { ...input, roleIds: [...input.roleIds, roleId] }, org)
}

export async function unassignRole(person: AppUser, roleId: string, org: OrgData) {
  const input = inputFromPerson(person)
  await savePerson(person.uid, { ...input, roleIds: input.roleIds.filter((id) => id !== roleId) }, org)
}

function storedFields(data: Partial<OrgRole>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if ((DERIVED_ROLE_FIELDS as readonly string[]).includes(key)) continue
    out[key] = value
  }
  return out
}

const OPTIONAL_ROLE_KEYS = ['reportsTo', 'portalBranchId', 'domain', 'recruitmentUrgency'] as const

/** Create or update a position. Holders are not stored here — see savePerson. */
export async function saveRole(roleId: string | null, data: StoredOrgRole, org: OrgData): Promise<string> {
  const id = roleId ?? doc(collection(db, 'roles')).id
  const fields = storedFields(data)
  const batch = writeBatch(db)
  const ref = doc(db, 'roles', id)

  if (roleId) {
    for (const key of OPTIONAL_ROLE_KEYS) if (fields[key] === undefined) fields[key] = deleteField()
    for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key]
    batch.update(ref, { ...fields, updatedAt: serverTimestamp() })
  } else {
    for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key]
    batch.set(ref, { ...fields, createdAt: serverTimestamp() })
  }

  const prev = roleId ? org.roles.find((r) => r.id === roleId) : undefined
  if (prev && prev.portalBranchId !== data.portalBranchId) {
    const nextRoles = org.roles.map((r) => (r.id === roleId ? { ...r, portalBranchId: data.portalBranchId } : r))
    for (const holder of prev.holders) {
      const person = org.people.find((p) => p.uid === holder.uid)
      if (!person) continue
      batch.update(doc(db, 'users', person.uid), {
        branchIds: branchIdsFor(person.roleIds ?? [], nextRoles),
        updatedAt: serverTimestamp(),
      })
    }
  }

  await batch.commit()
  return id
}

/** Delete a position; its holders leave it (and are archived as former holders). */
export async function deleteRole(role: OrgRole, org: OrgData) {
  const batch = writeBatch(db)
  for (const holder of role.holders) {
    const person = org.people.find((p) => p.uid === holder.uid)
    if (!person) continue
    const input = inputFromPerson(person)
    const plan = planPersonSave(
      person.uid, person,
      { ...input, roleIds: input.roleIds.filter((id) => id !== role.id) },
      org.roles, new Date(),
    )
    applyPlan(batch, person.uid, false, plan, role.id)
  }
  batch.delete(doc(db, 'roles', role.id))
  await batch.commit()
}

// ── Logins (server side — needs the Admin SDK) ───────────────────────────────

/**
 * Makes sure an HQ person can sign in with their e-mail, and sets the password
 * (their phone number unless one is given). Returns the password that was set.
 */
export async function ensureLogin(personId: string, password?: string): Promise<string> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('לא מחובר — התחבר מחדש ונסה שוב')
  const res = await fetch('/.netlify/functions/admin-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ personId, password }),
  })
  const data = await res.json().catch(() => ({})) as { password?: string; error?: string }
  if (!res.ok || !data.password) throw new Error(data.error ?? 'שגיאה בהגדרת הכניסה למערכת')
  return data.password
}
