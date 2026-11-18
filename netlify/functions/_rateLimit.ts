import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { afterFailure, isLocked, type AttemptState } from './_rateLimitCore'

export interface LimitKey { key: string; limit: number }

const ref = (db: Firestore, key: string) =>
  db.collection('loginAttempts').doc(createHash('sha256').update(key).digest('hex'))

/** Minutes left on the longest active lock among the keys, or 0 when none is locked. */
export async function lockedMinutes(db: Firestore, keys: LimitKey[]): Promise<number> {
  const now = Date.now()
  const snaps = await Promise.all(keys.map((k) => ref(db, k.key).get()))
  const until = Math.max(0, ...snaps.map((s) => {
    const st = s.data() as AttemptState | undefined
    return isLocked(st, now) ? st!.lockedUntil : 0
  }))
  return until > now ? Math.ceil((until - now) / 60000) : 0
}

export async function recordFailure(db: Firestore, keys: LimitKey[]): Promise<void> {
  const now = Date.now()
  await Promise.all(keys.map((k) => db.runTransaction(async (tx) => {
    const r = ref(db, k.key)
    const prev = (await tx.get(r)).data() as AttemptState | undefined
    tx.set(r, afterFailure(prev, now, k.limit))
  })))
}

export async function clearKey(db: Firestore, key: string): Promise<void> {
  await ref(db, key).delete().catch(() => undefined)
}
