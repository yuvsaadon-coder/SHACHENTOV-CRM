import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { handler as portalLoginHandler } from '../../../../../netlify/functions/portal-login'
import { handler as chatHandler } from '../../../../../netlify/functions/chat'
import { handler as hqChatHandler } from '../../../../../netlify/functions/hq-chat'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { seedCoordinator, seedHqUser, FIXTURE } from '../../../support/knowledge-fixtures'
import {
  realIdTokenForUid, exchangeCustomToken, adminApp, clearAuthUsers, clearFirestore, resetEmulatorApp,
} from '../../../support/knowledge-admin'
import { stubAnthropic, anthropicTextReply } from '../../../support/knowledge-provider-stub'
import { getAuth } from 'firebase-admin/auth'

/**
 * TEST-F01 (emulator lane — every case here requires a genuine
 * verifyIdToken/Firestore round trip against the real Auth+Firestore
 * emulator to reach the code under test: `realIdTokenForUid` mints then
 * exchanges a real custom token via the live Auth Emulator REST endpoint,
 * and `chat.ts`/`hq-chat.ts` both call the real `getAuth().verifyIdToken`
 * against it). Runs serially under `tests/requirements/vitest.rules.config.ts`
 * (fileParallelism:false, maxWorkers:1) alongside the rest of the emulator
 * suite, under the parent's emulator wrapper — never started by this file.
 * The network-free subset of F01 (ai-proxy, summarize-article, and the
 * portal-login/malformed/invalid-shape cases that crash before any live
 * query) stays in `tests/requirements/contracts/F01.test.ts`.
 * Requirement T07a/T07b/T04a. Anthropic provider transport is stubbed
 * (never a live key/account) — only Firestore/Auth are genuinely real here.
 */
describe('TEST-F01 serverless contract — method/media/body (real-emulator subset)', () => {
  let coordAToken: string
  let hqToken: string

  async function deleteAllApps() {
    await resetEmulatorApp()
    await Promise.all(getApps().map(async (app) => {
      await deleteApp(app)
    }))
  }

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
    await seedHqUser({ uid: FIXTURE.hq.uid, name: FIXTURE.hq.name, role: FIXTURE.hq.domain })
    coordAToken = await realIdTokenForUid(FIXTURE.coordA.uid)
    hqToken = await realIdTokenForUid(FIXTURE.hq.uid)
  })

  afterAll(async () => {
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  // ---- TEST-F01.portal-login.valid-json (A) ----
  it('TEST-F01.portal-login.valid-json', async () => {
    const res = await invoke(portalLoginHandler, makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ name: FIXTURE.coordA.name, phone: FIXTURE.coordA.phone }),
    }))
    expect(res.statusCode).toBe(200)
    const { token: customToken } = res.json as { token: string }
    expect(typeof customToken).toBe('string')
    // Real Auth Emulator exchange must resolve to the exact seeded coordinator UID —
    // a standalone fake token issuance cannot establish this positive control.
    const { idToken } = await exchangeCustomToken(customToken)
    const decoded = await getAuth(adminApp()).verifyIdToken(idToken)
    expect(decoded.uid).toBe(FIXTURE.coordA.uid)
  })

  // ---- TEST-F01.{chat,hq-chat}.media.{missing,wrong} (G) ----
  // Authorized protected JSON POST with no / a wrong Content-Type must be
  // rejected before expensive Firestore/provider work. Neither handler
  // currently inspects Content-Type at all, so these are expected gaps.
  const mediaCases = [
    {
      label: 'chat.media.missing',
      run: () => invoke(chatHandler, makeEvent({
        httpMethod: 'POST',
        contentType: null,
        body: JSON.stringify({ branchId: FIXTURE.branchA.id, mode: 'branch', messages: [], question: 'שלום' }),
        headers: { authorization: 'Bearer ' + coordAToken },
      })),
    },
    {
      label: 'chat.media.wrong',
      run: () => invoke(chatHandler, makeEvent({
        httpMethod: 'POST',
        contentType: 'text/plain',
        body: JSON.stringify({ branchId: FIXTURE.branchA.id, mode: 'branch', messages: [], question: 'שלום' }),
        headers: { authorization: 'Bearer ' + coordAToken },
      })),
    },
    {
      label: 'hq-chat.media.missing',
      run: () => invoke(hqChatHandler, makeEvent({
        httpMethod: 'POST',
        contentType: null,
        body: JSON.stringify({ scopes: ['hq'], messages: [{ role: 'user', content: 'שלום' }] }),
        headers: { authorization: 'Bearer ' + hqToken },
      })),
    },
    {
      label: 'hq-chat.media.wrong',
      run: () => invoke(hqChatHandler, makeEvent({
        httpMethod: 'POST',
        contentType: 'text/plain',
        body: JSON.stringify({ scopes: ['hq'], messages: [{ role: 'user', content: 'שלום' }] }),
        headers: { authorization: 'Bearer ' + hqToken },
      })),
    },
  ]
  for (const { label, run } of mediaCases) {
    it(`TEST-F01.${label}`, async () => {
      stubAnthropic(() => anthropicTextReply('should not be reached'))
      const res = await run()
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
    })
  }

  // ---- TEST-F01.{chat,hq-chat}.malformed-json (G) ----
  const malformedCases = [
    {
      label: 'chat',
      run: () => invoke(chatHandler, makeEvent({ httpMethod: 'POST', body: '{not-json', headers: { authorization: 'Bearer ' + coordAToken } })),
    },
    {
      label: 'hq-chat',
      run: () => invoke(hqChatHandler, makeEvent({ httpMethod: 'POST', body: '{not-json', headers: { authorization: 'Bearer ' + hqToken } })),
    },
  ]
  for (const { label, run } of malformedCases) {
    it(`TEST-F01.${label}.malformed-json`, async () => {
      // Firm acceptance: malformed JSON must produce a safe 4xx validation
      // response, never an escaping exception or a raw 500 leaking parser
      // internals. Handlers with an unguarded `JSON.parse` will fail this.
      const res = await run()
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
    })
  }

  // ---- TEST-F01.{chat,hq-chat}.invalid-shape.{null,array,wrong-field-type} (G) ----
  const shapes: Record<string, unknown> = {
    null: null,
    array: ['not', 'an', 'object'],
    'wrong-field-type': {
      name: 42, phone: 42, branchId: 42, mode: 42, messages: 'not-an-array', scopes: 'not-an-array', title: 42,
    },
  }
  for (const [shapeName, shapeBody] of Object.entries(shapes)) {
    it(`TEST-F01.chat.invalid-shape.${shapeName}`, async () => {
      const res = await invoke(chatHandler, makeEvent({
        httpMethod: 'POST', body: JSON.stringify(shapeBody), headers: { authorization: 'Bearer ' + coordAToken },
      }))
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
    })
    it(`TEST-F01.hq-chat.invalid-shape.${shapeName}`, async () => {
      const res = await invoke(hqChatHandler, makeEvent({
        httpMethod: 'POST', body: JSON.stringify(shapeBody), headers: { authorization: 'Bearer ' + hqToken },
      }))
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
    })
  }
})
