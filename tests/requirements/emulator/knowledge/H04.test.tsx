import '../../support/knowledge-vite-env'
/**
 * TEST-PLAN.md coverage:
 * - "### H — real chat workflows and source fidelity" row H04
 * - "## 6.1 Concrete subcase registry — authoritative classification" row H04
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { handler as chatHandler } from '../../../../netlify/functions/chat'
import { adminDb, clearAuthUsers, clearFirestore, realIdTokenForUid, resetEmulatorApp } from '../../support/knowledge-admin'
import { connectClientEmulators } from '../../support/knowledge-client-emulator'
import { fakeServiceAccountJson } from '../../support/knowledge-fake-service-account'
import { FIXTURE, seedCoordinator } from '../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../../support/knowledge-provider-stub'

interface ProviderRequest {
  system?: string
}

const BRANCH_A_SENTINEL = 'BRANCH_A_SENTINEL'
const BRANCH_B_SENTINEL = 'BRANCH_B_SENTINEL'
const GLOBAL_SENTINEL = 'GLOBAL_SENTINEL'
const RESEARCH_SENTINEL = 'RESEARCH_SENTINEL'

async function deleteAllApps() {
  await resetEmulatorApp()
  await Promise.all(getApps().map(async (app) => {
    await deleteApp(app)
  }))
}

async function invokeChat(idToken: string, body: Record<string, unknown>) {
  return invoke(chatHandler, makeEvent({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'מה יש במאגר?' }],
      question: 'מה יש במאגר?',
      ...body,
    }),
  }))
}

describe('TEST-H04 chat branch scoping', () => {
  let coordAToken = ''

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

    await seedCoordinator({
      uid: FIXTURE.coordA.uid,
      name: FIXTURE.coordA.name,
      phone: FIXTURE.coordA.phone,
      branchId: FIXTURE.branchA.id,
      branchName: FIXTURE.branchA.name,
    })
    await adminDb().collection('branches').doc(FIXTURE.branchB.id).set({
      name: FIXTURE.branchB.name,
      city: FIXTURE.branchB.city,
      type: 'food',
      coordinatorUids: [FIXTURE.coordB.uid],
    })
    await adminDb().collection('knowledgeItems').doc('branch-a-knowledge').set({
      branchId: FIXTURE.branchA.id,
      title: BRANCH_A_SENTINEL,
      content: `content ${BRANCH_A_SENTINEL}`,
      type: 'document',
    })
    await adminDb().collection('knowledgeItems').doc('branch-b-knowledge').set({
      branchId: FIXTURE.branchB.id,
      title: BRANCH_B_SENTINEL,
      content: `content ${BRANCH_B_SENTINEL}`,
      type: 'document',
    })
    await adminDb().collection('knowledgeItems').doc('global-knowledge').set({
      branchId: 'global',
      title: GLOBAL_SENTINEL,
      content: `content ${GLOBAL_SENTINEL}`,
      type: 'document',
    })
    await adminDb().collection('knowledge_articles').doc('research-knowledge').set({
      titleHe: RESEARCH_SENTINEL,
      summary: `summary ${RESEARCH_SENTINEL}`,
      lang: 'עברית',
    })

    coordAToken = await realIdTokenForUid(FIXTURE.coordA.uid)
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

  it('TEST-H04.own-branch-context (A)', async () => {
    const calls: ProviderRequest[] = []
    stubAnthropic((body) => {
      calls.push((body ?? {}) as ProviderRequest)
      return anthropicTextReply('branch-only')
    })

    const res = await invokeChat(coordAToken, {
      branchId: FIXTURE.branchA.id,
      mode: 'branch',
    })
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    expect(system).toContain(BRANCH_A_SENTINEL)
    expect(system).not.toContain(GLOBAL_SENTINEL)
    expect(system).not.toContain(RESEARCH_SENTINEL)
    expect(system).not.toContain(BRANCH_B_SENTINEL)
  })

  it('TEST-H04.all-mode-context (A)', async () => {
    const calls: ProviderRequest[] = []
    stubAnthropic((body) => {
      calls.push((body ?? {}) as ProviderRequest)
      return anthropicTextReply('all-mode')
    })

    const res = await invokeChat(coordAToken, {
      branchId: FIXTURE.branchA.id,
      mode: 'all',
    })
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    expect(system).toContain(BRANCH_A_SENTINEL)
    expect(system).toContain(GLOBAL_SENTINEL)
    expect(system).toContain(RESEARCH_SENTINEL)
    expect(system).not.toContain(BRANCH_B_SENTINEL)
  })

  it('TEST-H04.foreign-branch-denial (A)', async () => {
    let anthropicCalls = 0
    stubAnthropic(() => {
      anthropicCalls += 1
      return anthropicTextReply('should not be reached')
    })

    const res = await invokeChat(coordAToken, {
      branchId: FIXTURE.branchB.id,
      mode: 'all',
    })

    expect(res.statusCode).toBe(403)
    expect(anthropicCalls).toBe(0)
  })
})
