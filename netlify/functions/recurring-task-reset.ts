import type { Handler } from '@netlify/functions'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type Firestore,
  getFirestore,
} from 'firebase-admin/firestore'
import {
  processRecurringTaskPages,
  recurringTaskUpdate,
  type RecurringTaskPageStore,
} from '../../src/utils/recurringTaskLifecycle'
import type { TaskFrequency, TaskStatus } from '../../src/types'

const JOB_REF = 'systemJobs/recurringTaskReset'

function initFirebase(): Firestore {
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
    initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
  }
  return getFirestore()
}

class FirestoreRecurringTaskStore implements RecurringTaskPageStore {
  constructor(private readonly db: Firestore) {}

  async listTaskIds(afterId: string | null, limit: number): Promise<string[]> {
    let query = this.db.collection('tasks').orderBy(FieldPath.documentId()).limit(limit)
    if (afterId) query = query.startAfter(afterId)
    const snapshot = await query.select().get()
    return snapshot.docs.map((document) => document.id)
  }

  async applyPage(
    taskIds: string[],
    now: Date,
  ): Promise<{ scanned: number; updated: number }> {
    return this.db.runTransaction(async (transaction) => {
      const refs = taskIds.map((id) => this.db.collection('tasks').doc(id))
      const snapshots = await transaction.getAll(...refs)
      let updated = 0

      for (const snapshot of snapshots) {
        if (!snapshot.exists) continue
        const data = snapshot.data() as {
          frequency?: TaskFrequency
          status?: TaskStatus
          cycleKey?: string
          updatedAt?: Timestamp
        }
        const update = recurringTaskUpdate(data, now)
        if (!update) continue

        transaction.update(snapshot.ref, {
          ...update,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'מערכת',
        })
        updated += 1
      }

      return { scanned: snapshots.filter((snapshot) => snapshot.exists).length, updated }
    })
  }
}

export const handler: Handler = async () => {
  const startedAt = new Date()
  let db: Firestore | null = null

  try {
    db = initFirebase()
    await db.doc(JOB_REF).set({
      status: 'running',
      lastStartedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    const result = await processRecurringTaskPages(
      new FirestoreRecurringTaskStore(db),
      startedAt,
    )

    await db.doc(JOB_REF).set({
      status: 'succeeded',
      lastSucceededAt: FieldValue.serverTimestamp(),
      lastError: FieldValue.delete(),
      ...result,
    }, { merge: true })

    console.info('Recurring task reset completed', result)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, ...result }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Recurring task reset failed', error)

    if (db) {
      try {
        await db.doc(JOB_REF).set({
          status: 'failed',
          lastFailedAt: FieldValue.serverTimestamp(),
          lastError: message,
        }, { merge: true })
      } catch (reportingError) {
        console.error('Could not persist recurring task reset failure', reportingError)
      }
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: message }),
    }
  }
}
