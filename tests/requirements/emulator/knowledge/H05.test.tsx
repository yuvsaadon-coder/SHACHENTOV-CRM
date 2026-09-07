import '../../support/knowledge-vite-env'
/**
 * TEST-PLAN.md coverage:
 * - "### H — real chat workflows and source fidelity" row H05
 * - "## 6.1 Concrete subcase registry — authoritative classification" row H05
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { Timestamp } from 'firebase-admin/firestore'
import { handler as hqChatHandler } from '../../../../netlify/functions/hq-chat'
import { adminDb, clearAuthUsers, clearFirestore, realIdTokenForUid, resetEmulatorApp } from '../../support/knowledge-admin'
import { connectClientEmulators } from '../../support/knowledge-client-emulator'
import { fakeServiceAccountJson } from '../../support/knowledge-fake-service-account'
import { seedHqUser } from '../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../../support/knowledge-provider-stub'

interface ProviderRequest {
  system?: string
}

const TASK_ONLY_SENTINEL = 'TASK_ONLY_SENTINEL'

async function deleteAllApps() {
  await resetEmulatorApp()
  await Promise.all(getApps().map(async (app) => {
    await deleteApp(app)
  }))
}

describe('TEST-H05 hq-chat task context coverage', () => {
  let hqToken = ''

  beforeAll(() => {
    connectClientEmulators()
  })

  beforeEach(async () => {
    await deleteAllApps()
    vi.unstubAllGlobals()
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = 'demo-anthropic-key'

    await clearFirestore()
    await clearAuthUsers()
    await seedHqUser({ uid: 'hq-fin', name: 'עובדת מטה', role: 'FIN' })
    await adminDb().collection('tasks').doc('task-fin').set({
      id: 'task-fin',
      domain: 'FIN',
      category: 'כספים',
      title: 'משימת כספים',
      steps: '',
      frequency: 'חד-פעמי',
      startDate: null,
      endDate: null,
      holidayAnchor: null,
      involved: [],
      activator: null,
      contactRefs: [],
      status: 'בעבודה',
      notes: TASK_ONLY_SENTINEL,
      createdAt: Timestamp.fromDate(new Date('2026-09-01T12:00:00Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-09-01T12:00:00Z')),
      createdBy: 'hq-fin',
      updatedBy: 'hq-fin',
    })
    hqToken = await realIdTokenForUid('hq-fin')
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await deleteAllApps()
  })

  it('TEST-H05.task-evidence-reaches-context (G)', async () => {
    const calls: ProviderRequest[] = []
    stubAnthropic((body) => {
      calls.push((body ?? {}) as ProviderRequest)
      return anthropicTextReply('תשובה סינתטית')
    })

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${hqToken}` },
      body: JSON.stringify({
        scopes: ['hq', 'research', 'global'],
        messages: [{ role: 'user', content: 'מה הסטטוס העדכני של המשימה?' }],
        question: 'מה הסטטוס העדכני של המשימה?',
      }),
    }))
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    // This inspects the real provider request because a canned reply could look
    // correct even when no task data ever left the handler.
    expect(system).toContain(TASK_ONLY_SENTINEL)
  })
})
