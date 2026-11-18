import type { Firestore } from 'firebase-admin/firestore'

/**
 * True when the person may act for the branch: it is one of their portal branches
 * (kept on their record as branchIds), re-derived from their positions when the
 * record is missing it (older accounts).
 */
export async function canAccessBranch(db: Firestore, uid: string, branchId: string): Promise<boolean> {
  const callerDoc = await db.collection('users').doc(uid).get()
  const caller = (callerDoc.data() ?? {}) as { active?: boolean; branchIds?: string[]; roleIds?: string[] }
  if (!callerDoc.exists || caller.active === false) return false
  if ((caller.branchIds ?? []).includes(branchId)) return true

  const roleSnaps = await Promise.all((caller.roleIds ?? []).map((id) => db.collection('roles').doc(id).get()))
  const derived = roleSnaps
    .map((d) => (d.data() as { portalBranchId?: string } | undefined)?.portalBranchId)
    .filter(Boolean) as string[]
  if (!derived.includes(branchId)) return false
  await callerDoc.ref.update({ branchIds: derived }).catch(() => null)
  return true
}
