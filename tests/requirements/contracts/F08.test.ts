import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, invoke } from '../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../support/knowledge-provider-stub'

/**
 * TEST-PLAN.md coverage:
 * - "### F — every serverless contract and cross-cutting server controls" row F08
 * - "## 6.1 Concrete subcase registry" row F08
 *
 * SCOPE NOTE (post parent infra review): `TEST-F08.health-valid-get`'s
 * "configured" case makes a genuine live Firestore `.get()` against the real
 * emulator once a valid service account is supplied, so it moved to
 * `tests/requirements/emulator/knowledge/contracts/F08.test.ts` (serial,
 * parent-owned emulator lifecycle). Every case kept in THIS file fails
 * before any live network call: portal-login/chat/hq-chat all crash inside
 * their own `initFirebase()`'s local `cert()`/`initializeApp()` step (no
 * network) whenever `FIREBASE_SERVICE_ACCOUNT` is deleted, and
 * summarize-article.ts never touches Firebase at all (Anthropic transport
 * stubbed only).
 */
describe('TEST-F08 configuration safety and import-time behavior (network-free subset)', () => {
  async function deleteAllApps() {
    const { deleteApp, getApps } = await import('firebase-admin/app')
    await Promise.all(getApps().map(async (app) => {
      await deleteApp(app)
    }))
  }

  beforeEach(async () => {
    await deleteAllApps()
    vi.resetModules()
  })

  afterAll(async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT
    delete process.env.ANTHROPIC_API_KEY
    await deleteAllApps()
  })

  function expectNoPathOrStackLeak(text: string | undefined) {
    expect(text ?? '').not.toMatch(/[A-Za-z]:\\|\/netlify\/functions\/| at /)
  }

  it('TEST-F08.portal-config-safe', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT
    const { handler } = await import('../../../netlify/functions/portal-login')

    const res = await invoke(handler, makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'רכזת תצורה', phone: '050-111-2222' }),
    }))

    expect(res.statusCode).toBe(500)
    expect(res.json).toEqual({ error: 'Server configuration error' })
    expectNoPathOrStackLeak(res.body)
  })

  it('TEST-F08.chat-config-safe', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT
    const { handler } = await import('../../../netlify/functions/chat')

    const res = await invoke(handler, makeEvent({
      httpMethod: 'POST',
      // Any non-empty *Bearer* header value works: this handler's
      // Authorization presence check runs BEFORE initFirebase(), so
      // verifyIdToken is never reached in this config-failure path — no
      // real token needed, only the "Bearer " prefix so the earlier
      // missing-token 401 check doesn't fire first.
      headers: { authorization: 'Bearer any-non-empty-token' },
      body: JSON.stringify({
        branchId: 'branch-a',
        mode: 'branch',
        messages: [{ role: 'user', content: 'שלום' }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBe(500)
    expect(res.json).toEqual({ error: 'Server configuration error' })
    expectNoPathOrStackLeak(res.body)
  })

  it('TEST-F08.hq-config-safe', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT
    const { handler } = await import('../../../netlify/functions/hq-chat')

    const res = await invoke(handler, makeEvent({
      httpMethod: 'POST',
      // Same as chat-config-safe above: no real token needed, this path
      // never reaches verifyIdToken — only the "Bearer " prefix matters.
      headers: { authorization: 'Bearer any-non-empty-token' },
      body: JSON.stringify({
        scopes: ['hq'],
        messages: [{ role: 'user', content: 'שלום' }],
      }),
    }))

    expect(res.statusCode).toBe(500)
    expect(res.json).toMatchObject({
      error: expect.stringContaining('FIREBASE_SERVICE_ACCOUNT'),
    })
    expect(res.body ?? '').not.toContain('-----BEGIN PRIVATE KEY-----')
    expectNoPathOrStackLeak(res.body)
  })

  it('TEST-F08.summarize-import-time-key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { handler } = await import('../../../netlify/functions/summarize-article')

    process.env.ANTHROPIC_API_KEY = 'late-bound-demo-key'

    let capturedApiKey: string | null = null
    const previousFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('api.anthropic.com')) {
        capturedApiKey = new Headers(init?.headers).get('x-api-key')
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'סיכום סינתטי' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return previousFetch(input as RequestInfo, init)
    })

    const res = await invoke(handler, makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'מסמך בדיקה' }),
    }))

    expect(res.statusCode).toBe(200)
    expect(capturedApiKey).toBe('')
  })

  it('TEST-F08.summarize-unusable-config', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { handler } = await import('../../../netlify/functions/summarize-article')

    let anthropicCalls = 0
    stubAnthropic(() => {
      anthropicCalls += 1
      return anthropicTextReply('unexpected success')
    })

    await invoke(handler, makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ title: 'מסמך בדיקה' }),
    }))

    expect(anthropicCalls).toBe(0)
  })
})
