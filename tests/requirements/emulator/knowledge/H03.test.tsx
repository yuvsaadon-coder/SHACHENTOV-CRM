import '../../support/knowledge-vite-env'
/**
 * TEST-PLAN.md coverage:
 * - "### H — real chat workflows and source fidelity" row H03
 * - "## 6.1 Concrete subcase registry — authoritative classification" row H03
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
import { installSourceTransportFault } from '../../support/knowledge-grpc-fault'

interface ProviderRequest {
  system?: string
  messages?: Array<{ role: string; content: string }>
}

const SENTINELS = {
  hq: 'HQ_SENTINEL_ITEM',
  research: 'RESEARCH_SENTINEL_ARTICLE',
  global: 'GLOBAL_SENTINEL_ITEM',
  branch: 'BRANCH_SENTINEL_ITEM',
  branchB: 'BRANCH_B_SENTINEL_ITEM',
  reports: 'REPORTS_SENTINEL_VALUE',
} as const

function providerCapture(reply = 'stubbed hq reply') {
  const calls: ProviderRequest[] = []
  stubAnthropic((body) => {
    calls.push((body ?? {}) as ProviderRequest)
    return anthropicTextReply(reply)
  })
  return calls
}

async function deleteAllApps() {
  await resetEmulatorApp()
  await Promise.all(getApps().map(async (app) => {
    await deleteApp(app)
  }))
}

async function invokeHqChat(idToken: string, body: Record<string, unknown>) {
  return invoke(hqChatHandler, makeEvent({
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'בדיקת מקורות' }],
      question: 'בדיקת מקורות',
      domainFilter: null,
      branchFilter: null,
      ...body,
    }),
  }))
}

async function seedAllSources() {
  const db = adminDb()

  await db.collection('hq_knowledge').doc('hq-sentinel').set({
    domain: 'FIN',
    category: 'procedures',
    title: SENTINELS.hq,
    content: `content ${SENTINELS.hq}`,
  })
  await db.collection('knowledge_articles').doc('research-sentinel').set({
    titleHe: SENTINELS.research,
    summary: `summary ${SENTINELS.research}`,
    lang: 'עברית',
  })
  await db.collection('knowledgeItems').doc('global-sentinel').set({
    branchId: 'global',
    title: SENTINELS.global,
    content: `content ${SENTINELS.global}`,
    type: 'document',
  })
  await db.collection('knowledgeItems').doc('branch-a-sentinel').set({
    branchId: 'branch-a',
    title: SENTINELS.branch,
    content: `content ${SENTINELS.branch}`,
    type: 'document',
  })
  await db.collection('quarterlyReports').doc('report-sentinel').set({
    branchId: 'branch-a',
    branchType: 'food',
    quarter: 'Q3',
    year: 2026,
    submittedBy: 'coord-a',
    submittedAt: Timestamp.fromDate(new Date('2026-09-01T12:00:00Z')),
    isFirstReport: false,
    // Real portal shape is `data`, not `answers`; this intentionally mirrors
    // production so H06 can expose the interoperability gap honestly.
    data: { note: SENTINELS.reports },
  })
}

describe('TEST-H03 hq-chat source fidelity', () => {
  let hqToken = ''
  let sourceFault: ReturnType<typeof installSourceTransportFault>

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
    sourceFault = installSourceTransportFault(adminDb())
    await seedHqUser({ uid: 'hq-fin', name: 'בודק מטה', role: 'FIN' })
    await seedAllSources()
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

  it('TEST-H03.source.hq (A)', async () => {
    const calls = providerCapture()
    const res = await invokeHqChat(hqToken, { scopes: ['hq'], domainFilter: 'FIN' })
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    expect(system).toContain(SENTINELS.hq)
    expect(system).not.toContain(SENTINELS.research)
    expect(system).not.toContain(SENTINELS.global)
    expect(system).not.toContain(SENTINELS.branch)
    expect(system).not.toContain(SENTINELS.branchB)
    expect(system).not.toContain(SENTINELS.reports)
  })

  it('TEST-H03.source.research (A)', async () => {
    const calls = providerCapture()
    const res = await invokeHqChat(hqToken, { scopes: ['research'] })
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    expect(system).toContain(SENTINELS.research)
    expect(system).not.toContain(SENTINELS.hq)
    expect(system).not.toContain(SENTINELS.global)
    expect(system).not.toContain(SENTINELS.branch)
    expect(system).not.toContain(SENTINELS.branchB)
    expect(system).not.toContain(SENTINELS.reports)
  })

  it('TEST-H03.source.global (A)', async () => {
    const calls = providerCapture()
    const res = await invokeHqChat(hqToken, { scopes: ['global'] })
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    expect(system).toContain(SENTINELS.global)
    expect(system).not.toContain(SENTINELS.hq)
    expect(system).not.toContain(SENTINELS.research)
    expect(system).not.toContain(SENTINELS.branch)
    expect(system).not.toContain(SENTINELS.branchB)
    expect(system).not.toContain(SENTINELS.reports)
  })

  it('TEST-H03.source.branch (A)', async () => {
    const calls = providerCapture()
    const res = await invokeHqChat(hqToken, { scopes: ['branch'] })
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    expect(system).toContain(SENTINELS.branch)
    expect(system).not.toContain(SENTINELS.hq)
    expect(system).not.toContain(SENTINELS.research)
    expect(system).not.toContain(SENTINELS.global)
    expect(system).not.toContain(SENTINELS.branchB)
    expect(system).not.toContain(SENTINELS.reports)
  })

  it('TEST-H03.source.reports (A)', async () => {
    const calls = providerCapture()
    const res = await invokeHqChat(hqToken, { scopes: ['reports'], branchFilter: 'branch-a' })
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    expect(system).toContain('דיווחי רכזים:')
    expect(system).toContain(SENTINELS.reports)
    expect(system).not.toContain(SENTINELS.hq)
    expect(system).not.toContain(SENTINELS.research)
    expect(system).not.toContain(SENTINELS.global)
    expect(system).not.toContain(SENTINELS.branch)
    expect(system).not.toContain(SENTINELS.branchB)
  })

  it('TEST-H03.partial-source-success (A)', async () => {
    sourceFault.collection = 'knowledge_articles'
    const calls = providerCapture()
    const res = await invokeHqChat(hqToken, {
      scopes: ['hq', 'research', 'global', 'branch', 'reports'],
      domainFilter: 'FIN',
      branchFilter: 'branch-a',
    })
    const system = calls[0]?.system ?? ''
    const reply = (res.json as { reply?: string } | undefined)?.reply ?? ''

    expect(sourceFault.responsesFailed).toBeGreaterThan(0)
    expect(res.statusCode).toBe(200)
    expect(system).toContain(SENTINELS.hq)
    expect(system).not.toContain(SENTINELS.research)
    expect(system).toContain(SENTINELS.global)
    expect(system).toContain(SENTINELS.branch)
    expect(system).toContain('דיווחי רכזים:')
    expect(reply).toContain('⚠️ מקורות שלא נטענו:')
  })

  it('TEST-H03.current-branch-filter (C)', async () => {
    await adminDb().collection('knowledgeItems').doc('branch-b-sentinel').set({
      branchId: 'branch-b',
      title: SENTINELS.branchB,
      content: `content ${SENTINELS.branchB}`,
      type: 'document',
    })

    const calls = providerCapture()
    const res = await invokeHqChat(hqToken, {
      scopes: ['branch'],
      branchFilter: 'branch-a',
    })
    const system = calls[0]?.system ?? ''

    expect(res.statusCode).toBe(200)
    expect(system).toContain(SENTINELS.branch)
    expect(system).toContain(SENTINELS.branchB)
  })
})
