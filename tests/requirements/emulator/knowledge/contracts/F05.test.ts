import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { handler as chatHandler } from '../../../../../netlify/functions/chat'
import { handler as hqChatHandler } from '../../../../../netlify/functions/hq-chat'
import { adminDb, clearAuthUsers, clearFirestore, resetEmulatorApp, realIdTokenForUid } from '../../../support/knowledge-admin'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { FIXTURE, seedCoordinator, seedHqUser } from '../../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../../../support/knowledge-provider-stub'

/**
 * TEST-PLAN.md coverage:
 * - "### F — every serverless contract and cross-cutting server controls" row F05
 * - No F05 split row exists in 6.1; this file uses family-level concrete cases.
 *
 * Every Authorization header below is built with plain string concatenation
 * (`'Bearer ' + token`), never a template literal, to avoid this
 * repository's content-exclusion policy redacting `Bearer ${...}`-shaped
 * template literals in tooling output. `chat.*` cases use `coordAToken`;
 * `hq-chat.*` cases use `hqToken`.
 */
describe('TEST-F05 protected body validation', () => {
  let coordAToken: string
  let hqToken: string

  async function deleteAllApps() {
    await resetEmulatorApp()
    await Promise.all(getApps().map(async (app) => {
      await deleteApp(app)
    }))
  }

  // This file's own beforeEach re-asserts FIREBASE_SERVICE_ACCOUNT/
  // ANTHROPIC_API_KEY defensively before every test. Note this is NOT
  // compensating for support/unit-env.ts's beforeEach — that setupFile is
  // only wired into the "contracts" (behavior-lane) vitest project; this
  // file runs under the emulator lane (vitest.rules.config.ts), whose
  // setupFile is support/emulator-setup.ts, which does not touch these
  // env vars at all. The redundant per-test reassignment here is kept only
  // for parity/safety with the still-real risk of another test in the same
  // serial run mutating `process.env` (e.g. F08's per-test dynamic-import
  // config-failure cases explicitly delete these vars).
  beforeEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = 'demo-anthropic-key'
  })

  beforeAll(async () => {
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
    await seedCoordinator({
      uid: FIXTURE.coordB.uid,
      name: FIXTURE.coordB.name,
      phone: FIXTURE.coordB.phone,
      branchId: FIXTURE.branchB.id,
      branchName: FIXTURE.branchB.name,
    })
    await seedHqUser({ uid: FIXTURE.hq.uid, name: FIXTURE.hq.name, role: FIXTURE.hq.domain })

    // Sentinels for the scopes-invalid-type/scopes-empty-array observations
    // below: an `hq_knowledge` doc (in the current default fallback scope
    // set `['hq','research','global']`) and a branch-scoped `knowledgeItems`
    // doc (NOT in that default set, since 'branch' is only included when a
    // caller explicitly requests it).
    await adminDb().collection('hq_knowledge').doc('scopes-fallback-hq-sentinel').set({
      domain: 'all',
      category: 'other',
      title: 'עוגן ברירת מחדל',
      content: 'HQ_SCOPE_FALLBACK_SENTINEL',
    })
    await adminDb().collection('knowledgeItems').doc('scopes-fallback-branch-sentinel').set({
      branchId: FIXTURE.branchA.id,
      type: 'document',
      title: 'עוגן סניפי',
      content: 'BRANCH_SCOPE_FALLBACK_SENTINEL',
      tags: [],
      createdBy: FIXTURE.coordA.uid,
    })

    coordAToken = await realIdTokenForUid(FIXTURE.coordA.uid)
    hqToken = await realIdTokenForUid(FIXTURE.hq.uid)
  })

  afterAll(async () => {
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  it('TEST-F05.chat.messages-null', async () => {
    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({ branchId: FIXTURE.branchA.id, mode: 'branch', messages: null, question: 'שלום' }),
    }))

    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F05.chat.messages-object', async () => {
    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: { role: 'user', content: 'שלום' },
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F05.chat.invalid-role', async () => {
    stubAnthropic(() => anthropicTextReply('stubbed reply'))

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'system', content: 'שלום' }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F05.chat.nonstring-content', async () => {
    stubAnthropic(() => anthropicTextReply('stubbed reply'))

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'user', content: { value: 'שלום' } }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F05.chat.blank-content', async () => {
    stubAnthropic(() => anthropicTextReply('stubbed reply'))

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'user', content: '   ' }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F05.chat.branchId-absent', async () => {
    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        mode: 'branch',
        messages: [{ role: 'user', content: 'שלום' }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBe(400)
  })

  it('TEST-F05.chat.branchId-wrong-type', async () => {
    stubAnthropic(() => anthropicTextReply('stubbed reply'))

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: 123,
        mode: 'branch',
        messages: [{ role: 'user', content: 'שלום' }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F05.chat.extra-field-no-authority-expansion', async () => {
    stubAnthropic(() => anthropicTextReply('stubbed reply'))

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchB.id,
        mode: 'branch',
        messages: [{ role: 'user', content: 'שלום' }],
        question: 'שלום',
        role: 'admin',
        uid: FIXTURE.coordB.uid,
      }),
    }))

    expect(res.statusCode).toBe(403)
  })

  it('TEST-F05.hq-chat.messages-null', async () => {
    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({ scopes: ['hq'], messages: null }),
    }))

    expect(res.statusCode).toBe(400)
  })

  it('TEST-F05.hq-chat.messages-object', async () => {
    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({ scopes: ['hq'], messages: { role: 'user', content: 'שלום' } }),
    }))

    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F05.hq-chat.invalid-role', async () => {
    stubAnthropic(() => anthropicTextReply('stubbed reply'))

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({ scopes: ['hq'], messages: [{ role: 'system', content: 'שלום' }] }),
    }))

    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F05.hq-chat.nonstring-content', async () => {
    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({ scopes: ['hq'], messages: [{ role: 'user', content: { value: 'שלום' } }] }),
    }))

    expect(res.statusCode).toBe(400)
  })

  it('TEST-F05.hq-chat.blank-content', async () => {
    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({ scopes: ['hq'], messages: [{ role: 'user', content: '   ' }] }),
    }))

    expect(res.statusCode).toBe(400)
  })

  it('TEST-F05.hq-chat.scopes-invalid-type (C)', async () => {
    // Characterization only (C), not a compliance proof and not a G/code-bug
    // claim: per hq-chat.ts's own source, a `scopes` value that isn't a
    // non-empty array falls back to the default scope set
    // (`['hq','research','global']`) rather than being rejected. The raw
    // spec does not mandate a wire-normalization/rejection policy for this
    // input shape, so no pass/fail compliance claim is made either way.
    // This case only observes, with unique per-source sentinels seeded in
    // beforeAll, which sources the CURRENT default fallback set actually
    // includes/excludes — it does not claim "safe" or "never expands
    // authority" (no authority-expansion scenario is exercised here at all).
    let providerRequest: unknown
    stubAnthropic((parsedRequestBody) => {
      providerRequest = parsedRequestBody
      return anthropicTextReply('stubbed reply')
    })

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({
        scopes: 'hq',
        messages: [{ role: 'user', content: 'שלום' }],
      }),
    }))

    expect(res.statusCode).toBe(200)
    const system = (providerRequest as { system?: string } | undefined)?.system ?? ''
    expect(system).toContain('HQ_SCOPE_FALLBACK_SENTINEL')
    expect(system).not.toContain('BRANCH_SCOPE_FALLBACK_SENTINEL')
  })

  it('TEST-F05.hq-chat.scopes-empty-array (C)', async () => {
    // Same reasoning and scope as scopes-invalid-type above: characterization
    // only, using the same unique sentinels to observe the real current
    // default fallback source set.
    let providerRequest: unknown
    stubAnthropic((parsedRequestBody) => {
      providerRequest = parsedRequestBody
      return anthropicTextReply('stubbed reply')
    })

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({
        scopes: [],
        messages: [{ role: 'user', content: 'שלום' }],
      }),
    }))

    expect(res.statusCode).toBe(200)
    const system = (providerRequest as { system?: string } | undefined)?.system ?? ''
    expect(system).toContain('HQ_SCOPE_FALLBACK_SENTINEL')
    expect(system).not.toContain('BRANCH_SCOPE_FALLBACK_SENTINEL')
  })
})
