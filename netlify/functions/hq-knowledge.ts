import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import {
  applyHQKnowledgeOperation,
  HQKnowledgePartialFailure,
  type HQKnowledgeRequest,
  type HQKnowledgeStore,
} from './_shared/hq-knowledge-service'

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

function response(statusCode: number, body: Record<string, unknown>): HandlerResponse {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) }
}

function initFirebase(): void {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.VITE_FIREBASE_STORAGE_BUCKET
  if (!storageBucket) throw new Error('Missing FIREBASE_STORAGE_BUCKET')
  const serviceAccount = JSON.parse(raw) as Record<string, string>
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket,
  })
}

function createStore(db: Firestore): HQKnowledgeStore {
  return {
    async getHQ(id) {
      const snapshot = await db.collection('hq_knowledge').doc(id).get()
      return { exists: snapshot.exists, data: snapshot.data() ?? {} }
    },
    async findMirrorIds(id) {
      const snapshot = await db.collection('knowledgeItems').where('sourceHQId', '==', id).get()
      return snapshot.docs.map((item) => item.id)
    },
    async commit(input) {
      const batch = db.batch()
      const hqRef = db.collection('hq_knowledge').doc(input.id)
      const mirrorRef = db.collection('knowledgeItems').doc(`hq-${input.id}`)

      if (input.operation === 'delete') {
        batch.delete(hqRef)
      } else if (input.operation === 'create') {
        batch.create(hqRef, {
          ...input.hqFields,
          createdBy: input.createdBy,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else {
        batch.set(hqRef, {
          ...input.hqFields,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }

      if (input.mirrorFields) {
        batch.set(mirrorRef, {
          ...input.mirrorFields,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
      for (const id of new Set(input.mirrorIdsToDelete)) {
        if (!input.mirrorFields || id !== mirrorRef.id) {
          batch.delete(db.collection('knowledgeItems').doc(id))
        }
      }
      await batch.commit()
    },
    async deleteStorage(path) {
      if (!path.startsWith('hq_knowledge/')) throw new Error('Refusing to delete outside hq_knowledge')
      await getStorage().bucket().file(path).delete({ ignoreNotFound: true })
    },
  }
}

async function mutate(event: HandlerEvent): Promise<HandlerResponse> {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' })

  const authHeader = event.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return response(401, { error: 'לא מחובר — התחבר מחדש ונסה שוב.', operationApplied: false })

  try {
    initFirebase()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return response(500, { error: `הגדרת שירות מאגר הידע נכשלה: ${message}`, operationApplied: false })
  }
  let decoded
  try {
    decoded = await getAuth().verifyIdToken(token)
  } catch {
    return response(401, { error: 'ההתחברות פגה — רענן את הדף והתחבר מחדש.', operationApplied: false })
  }
  const db = getFirestore()
  const user = await db.collection('users').doc(decoded.uid).get()
  const userData = user.data() as { role?: string; name?: string } | undefined
  if (!user.exists || userData?.role !== 'admin') {
    return response(403, { error: 'רק מנהל מערכת יכול לשנות את מאגר הידע.', operationApplied: false })
  }

  let request: HQKnowledgeRequest
  try {
    request = JSON.parse(event.body ?? '{}') as HQKnowledgeRequest
  } catch {
    return response(400, { error: 'בקשה לא תקינה.', operationApplied: false })
  }
  try {
    await applyHQKnowledgeOperation(createStore(db), request, decoded.uid, userData.name ?? '')
    return response(200, { ok: true })
  } catch (error) {
    if (error instanceof HQKnowledgePartialFailure) {
      return response(500, {
        error: error.message,
        operationApplied: true,
        cleanupPaths: error.cleanupPaths,
      })
    }
    const message = error instanceof Error ? error.message : String(error)
    const statusCode = message === 'Knowledge item not found' ? 404 : 400
    return response(statusCode, { error: message, operationApplied: false })
  }
}

export const handler: Handler = async (event) => {
  try {
    return await mutate(event)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return response(500, { error: `פעולת מאגר הידע נכשלה: ${message}` })
  }
}
