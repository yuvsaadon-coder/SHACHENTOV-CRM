import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { handler as aiProxyHandler } from '../../../../../netlify/functions/ai-proxy'
import { adminDb, clearAuthUsers, clearFirestore, resetEmulatorApp } from '../../../support/knowledge-admin'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'

/**
 * TEST-F10.post-disabled (emulator lane). Split out of
 * `tests/requirements/contracts/F10.test.ts`: this case queries the real
 * `tasks` collection via `adminDb()` before/after invoking `ai-proxy.ts` to
 * prove no mutation occurred — a genuine live Firestore round trip that must
 * run serially under the parent's emulator wrapper.
 */
describe('TEST-F10 ai-proxy disabled write surface (real-emulator subset)', () => {
  async function deleteAllApps() {
    await resetEmulatorApp()
    await Promise.all(getApps().map(async (app) => {
      await deleteApp(app)
    }))
  }

  beforeAll(async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    await clearFirestore()
    await clearAuthUsers()
  })

  afterAll(async () => {
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  it('TEST-F10.post-disabled', async () => {
    const tasksBefore = await adminDb().collection('tasks').get()

    const res = await invoke(aiProxyHandler, makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'createTaskDraft',
        taskWrite: {
          title: 'משימה סינתטית',
          branchId: 'branch-a',
          status: 'new',
        },
        providerReply: {
          requestedToolAction: 'createTaskDraft',
        },
      }),
    }))

    const tasksAfter = await adminDb().collection('tasks').get()

    expect(res.statusCode).toBe(501)
    expect(res.json).toMatchObject({ error: expect.any(String) })
    expect(tasksAfter.size).toBe(tasksBefore.size)
  })
})
