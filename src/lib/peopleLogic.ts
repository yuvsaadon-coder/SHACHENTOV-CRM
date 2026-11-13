import type {
  AccessLevel, AppUser, Contact, Domain, OrgRole, Role, RoleHolder, RoleStatus, StoredOrgRole,
} from '../types'
import { DOMAINS, DOMAIN_LABELS } from '../types'

export const FORMER_CATEGORY = 'בעלי תפקידים לשעבר'
export const ORG_NAME = 'שכן טוב'

export const digitsOnly = (s: string | undefined | null) => (s ?? '').replace(/\D/g, '')

export function accessOf(user: Pick<AppUser, 'role'> | null | undefined): AccessLevel {
  const r = user?.role
  if (r === 'admin' || r === 'CEO') return 'admin'
  if (r === 'coordinator' || r === 'none') return r
  return r ? 'hq' : 'none'
}

export const isActive = (user: Pick<AppUser, 'active'>) => user.active !== false

export function isManager(user: Pick<AppUser, 'role' | 'active'> | null | undefined): boolean {
  return !!user && isActive(user) && accessOf(user) === 'admin'
}

const plain = (s: string) => s.replace(/["״'׳]/g, '').trim()

export function domainOfRole(role: Pick<OrgRole, 'domain' | 'level' | 'roleName' | 'area'>): Domain | null {
  if (role.domain) return role.domain
  if (role.level !== 'מטה') return null
  const text = plain(`${role.roleName} ${role.area ?? ''}`)
  return DOMAINS.find((d) => text.includes(plain(DOMAIN_LABELS[d]))) ?? null
}

type RoleRef = Pick<OrgRole, 'id' | 'domain' | 'level' | 'roleName' | 'area'>

export function domainOfPerson(user: Pick<AppUser, 'role' | 'roleIds'>, roles: RoleRef[]): Domain | null {
  const byId = new Map(roles.map((r) => [r.id, r]))
  for (const id of user.roleIds ?? []) {
    const role = byId.get(id)
    const domain = role ? domainOfRole(role) : null
    if (domain) return domain
  }
  return (DOMAINS as string[]).includes(user.role) ? (user.role as Domain) : null
}

export function holdersByRole(people: AppUser[]): Map<string, RoleHolder[]> {
  const map = new Map<string, RoleHolder[]>()
  const sorted = [...people].filter(isActive).sort((a, b) => a.name.localeCompare(b.name, 'he'))
  for (const p of sorted) {
    for (const roleId of new Set(p.roleIds ?? [])) {
      const list = map.get(roleId) ?? []
      list.push({ uid: p.uid, name: p.name, phone: p.phone ?? '', email: p.email ?? '' })
      map.set(roleId, list)
    }
  }
  return map
}

export function attachHolders(stored: (StoredOrgRole & { id: string })[], people: AppUser[]): OrgRole[] {
  const byRole = holdersByRole(people)
  return stored.map((r) => {
    const holders = byRole.get(r.id) ?? []
    return {
      ...r,
      holders,
      holderName: holders.map((h) => h.name).join(', '),
      phone: holders[0]?.phone ?? '',
      email: holders[0]?.email ?? '',
    }
  })
}

export function branchIdsFor(roleIds: string[], roles: Pick<OrgRole, 'id' | 'portalBranchId'>[]): string[] {
  const byId = new Map(roles.map((r) => [r.id, r]))
  const out = new Set<string>()
  for (const id of roleIds) {
    const branchId = byId.get(id)?.portalBranchId
    if (branchId) out.add(branchId)
  }
  return [...out]
}

export function coordinatorsOfBranch(branchId: string, roles: Pick<OrgRole, 'portalBranchId' | 'holders'>[]): RoleHolder[] {
  const seen = new Map<string, RoleHolder>()
  for (const r of roles) {
    if (r.portalBranchId !== branchId) continue
    for (const h of r.holders) if (!seen.has(h.uid)) seen.set(h.uid, h)
  }
  return [...seen.values()]
}

export const roleLabel = (role: Pick<OrgRole, 'roleName' | 'area'>) =>
  role.area ? `${role.roleName} — ${role.area}` : role.roleName

// ── Saving a person ──────────────────────────────────────────────────────────

export interface PersonInput {
  name: string
  phone: string
  email: string
  access: AccessLevel
  roleIds: string[]
  active: boolean
}

export function inputFromPerson(p: AppUser): PersonInput {
  return {
    name: p.name,
    phone: p.phone ?? '',
    email: p.email ?? '',
    access: accessOf(p),
    roleIds: p.roleIds ?? [],
    active: isActive(p),
  }
}

export function validatePerson(input: PersonInput, personId: string | null, people: AppUser[]): string | null {
  if (!input.name.trim()) return 'שם מלא הוא שדה חובה'
  const phone = digitsOnly(input.phone)
  const email = input.email.trim().toLowerCase()
  if (input.access === 'coordinator' && phone.length < 9) {
    return 'רכז/ת נכנס/ת לפורטל עם שם + מספר טלפון — יש להזין מספר טלפון מלא'
  }
  if (input.access === 'hq' || input.access === 'admin') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'לכניסת מטה נדרשת כתובת אימייל תקינה'
    if (phone.length < 6) return 'נדרש מספר טלפון — הוא משמש כסיסמה הראשונית'
    const clash = people.find((p) =>
      p.uid !== personId && accessOf(p) !== 'none' && accessOf(p) !== 'coordinator' &&
      (p.email ?? '').trim().toLowerCase() === email)
    if (clash) return `כתובת האימייל כבר משויכת ל${clash.name}`
  }
  if (input.access === 'coordinator') {
    const clash = people.find((p) =>
      p.uid !== personId && isActive(p) && accessOf(p) === 'coordinator' &&
      p.name.trim() === input.name.trim() && digitsOnly(p.phone) === phone)
    if (clash) return 'כבר קיים רכז/ת עם אותו שם ואותו מספר טלפון'
  }
  return null
}

export type FormerContact = Omit<Contact, 'endedAt'> & {
  formerPersonId: string
  formerRoleId: string
}

export const formerContactId = (personId: string, roleId: string) => `former-${personId}-${roleId}`

export function buildFormerContact(
  personId: string,
  details: { name: string; phone: string; email: string },
  role: Pick<OrgRole, 'id' | 'roleName' | 'area' | 'level'>,
  today: Date,
): FormerContact {
  const phone = digitsOnly(details.phone)
  const email = details.email.trim()
  return {
    id: formerContactId(personId, role.id),
    name: details.name.trim(),
    type: 'מטה',
    domainTags: [],
    phone,
    email,
    organization: ORG_NAME,
    role: roleLabel(role),
    category: FORMER_CATEGORY,
    notes: `מילא/ה את התפקיד "${roleLabel(role)}" (${role.level}) עד ${today.toLocaleDateString('he-IL')}`,
    needsInfo: !phone && !email,
    formerPersonId: personId,
    formerRoleId: role.id,
  }
}

export interface PersonSavePlan {
  user: {
    name: string
    phone: string
    email: string
    role: Role
    roleIds: string[]
    branchIds: string[]
    active: boolean
  }
  roleStatus: { roleId: string; status: RoleStatus }[]
  /** Positions the person just left — written to contacts as former holders. */
  archive: FormerContact[]
  /** Former-holder contacts made stale because the person is back in that position. */
  unarchive: string[]
}

/**
 * Everything that has to change when a person is created or edited. Positions
 * live only on the person, so leaving / joining a position is one write here —
 * the rest (role staffing status, former-holder contact) follows from the diff.
 */
export function planPersonSave(
  personId: string,
  prev: AppUser | null,
  input: PersonInput,
  roles: OrgRole[],
  today: Date,
): PersonSavePlan {
  const byId = new Map(roles.map((r) => [r.id, r]))
  const prevRoleIds = prev && isActive(prev) ? (prev.roleIds ?? []).filter((id) => byId.has(id)) : []
  const roleIds = input.active ? [...new Set(input.roleIds)].filter((id) => byId.has(id)) : []
  const removed = prevRoleIds.filter((id) => !roleIds.includes(id))
  const added = roleIds.filter((id) => !prevRoleIds.includes(id))

  const details = { name: input.name, phone: input.phone, email: input.email }
  const roleStatus: PersonSavePlan['roleStatus'] = []
  for (const id of removed) {
    const role = byId.get(id)!
    const othersRemain = role.holders.some((h) => h.uid !== personId)
    if (!othersRemain && role.status === 'מאויש') roleStatus.push({ roleId: id, status: 'חסר' })
  }
  for (const id of added) {
    if (byId.get(id)!.status === 'חסר') roleStatus.push({ roleId: id, status: 'מאויש' })
  }

  const role: Role = prev && accessOf(prev) === input.access ? prev.role : input.access

  return {
    user: {
      name: input.name.trim(),
      phone: digitsOnly(input.phone),
      email: input.email.trim().toLowerCase(),
      role,
      roleIds,
      branchIds: branchIdsFor(roleIds, roles),
      active: input.active,
    },
    roleStatus,
    archive: removed.map((id) => buildFormerContact(personId, details, byId.get(id)!, today)),
    unarchive: prev ? added.map((id) => formerContactId(personId, id)) : [],
  }
}
