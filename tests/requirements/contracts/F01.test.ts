import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { handler as portalLoginHandler } from '../../../netlify/functions/portal-login'
import { handler as summarizeHandler } from '../../../netlify/functions/summarize-article'
import { handler as aiProxyHandler } from '../../../netlify/functions/ai-proxy'
import { makeEvent, invoke } from '../support/knowledge-netlify-handler'
import { fakeServiceAccountJson } from '../support/knowledge-fake-service-account'
import { stubAnthropic, anthropicTextReply } from '../support/knowledge-provider-stub'

/**
 * TEST-F01 (contracts / behavior lane — no live emulator network calls).
 * netlify/functions/{portal-login,chat,hq-chat,summarize-article,ai-proxy}.ts
 * Requirement T07a/T07b/T04a.
 *
 * SCOPE NOTE (post parent infra review): this file previously also covered
 * `chat.*`/`hq-chat.*` cases and `portal-login.valid-json`, all of which
 * require a genuine `verifyIdToken`/Firestore round trip against the real
 * Auth+Firestore emulator (via `realIdTokenForUid`) to reach the code under
 * test. The "contracts" project (`tests/requirements/vitest.config.ts`) runs
 * under the behavior lane, which never starts an emulator and is not
 * guaranteed serial — those cases now live in
 * `tests/requirements/emulator/knowledge/contracts/F01.test.ts`, which runs
 * serially under the parent's emulator wrapper (`vitest.rules.config.ts`).
 *
 * Every case kept in THIS file crashes/short-circuits before any live
 * network call: `portal-login.ts`'s `initFirebase()` only calls
 * `cert()`/`initializeApp()` (pure local SDK setup, no network) and its
 * malformed/invalid-shape bodies throw during `JSON.parse`/property access
 * BEFORE the handler ever reaches `db.collection('users').get()`.
 * `summarize-article.ts` never touches Firebase at all — only the Anthropic
 * provider transport is stubbed (never a live key/account). `ai-proxy.ts`
 * makes zero Admin SDK or provider calls for any case.
 */
describe('TEST-F01 serverless contract — method/media/body (network-free subset)', () => {
  // support/unit-env.ts's own beforeEach (a global setupFile hook) deletes
  // FIREBASE_SERVICE_ACCOUNT/ANTHROPIC_API_KEY before EVERY test, so setting
  // them only in beforeAll left every test after the first one running with
  // an unusable config. Re-assert them every test. Setting
  // FIREBASE_SERVICE_ACCOUNT here never causes a network call in this file —
  // every portal-login case here fails before the handler's own Firestore
  // query is ever reached.
  beforeEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = 'demo-anthropic-key'
  })

  beforeAll(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = 'demo-anthropic-key'
  })

  afterAll(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT
    delete process.env.ANTHROPIC_API_KEY
  })

  // ---- TEST-F01.ai-proxy.post-scaffold (A) ----
  it('TEST-F01.ai-proxy.post-scaffold', async () => {
    const res = await invoke(aiProxyHandler, makeEvent({ httpMethod: 'POST', body: JSON.stringify({ any: 'thing' }) }))
    expect(res.statusCode).toBe(501)
    expect(res.json).toMatchObject({ error: expect.any(String) })
  })

  // ---- TEST-F01.ai-proxy.wrong-method (A) ----
  it('TEST-F01.ai-proxy.wrong-method', async () => {
    const res = await invoke(aiProxyHandler, makeEvent({ httpMethod: 'GET' }))
    expect(res.statusCode).toBe(405)
  })

  // ---- TEST-F01.summarize-article.valid-json (A) ----
  it('TEST-F01.summarize-article.valid-json', async () => {
    stubAnthropic(() => anthropicTextReply('סיכום סינתטי'))
    const res = await invoke(summarizeHandler, makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'מסמך בדיקה' }),
    }))
    expect(res.statusCode).toBe(200)
    expect(res.json).toMatchObject({ summary: 'סיכום סינתטי' })
  })

  // ---- TEST-F01.{portal-login,summarize-article}.malformed-json (G) ----
  const malformedCases = [
    { label: 'portal-login', run: () => invoke(portalLoginHandler, makeEvent({ httpMethod: 'POST', body: '{not-json' })) },
    { label: 'summarize-article', run: () => invoke(summarizeHandler, makeEvent({ httpMethod: 'POST', body: '{not-json' })) },
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

  // ---- TEST-F01.{portal-login,summarize-article}.invalid-shape.{null,array,wrong-field-type} (G) ----
  const shapes: Record<string, unknown> = {
    null: null,
    array: ['not', 'an', 'object'],
    'wrong-field-type': {
      name: 42, phone: 42, branchId: 42, mode: 42, messages: 'not-an-array', scopes: 'not-an-array', title: 42,
    },
  }
  for (const [shapeName, shapeBody] of Object.entries(shapes)) {
    it(`TEST-F01.portal-login.invalid-shape.${shapeName}`, async () => {
      const res = await invoke(portalLoginHandler, makeEvent({ httpMethod: 'POST', body: JSON.stringify(shapeBody) }))
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
    })
    it(`TEST-F01.summarize-article.invalid-shape.${shapeName}`, async () => {
      const res = await invoke(summarizeHandler, makeEvent({ httpMethod: 'POST', body: JSON.stringify(shapeBody) }))
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
    })
  }
})
