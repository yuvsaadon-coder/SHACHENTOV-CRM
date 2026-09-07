import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { handler as chatHandler } from '../../../../../netlify/functions/chat'
import { clearAuthUsers, clearFirestore, resetEmulatorApp, realIdTokenForUid } from '../../../support/knowledge-admin'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { FIXTURE, seedCoordinator } from '../../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../../../support/knowledge-provider-stub'

/**
 * TEST-PLAN.md coverage:
 * - "### F — every serverless contract and cross-cutting server controls" row F06
 * - "## 6.1 Concrete subcase registry" row F06
 *
 * Authorization header uses plain string concatenation (`'Bearer ' + token`),
 * never a template literal, to avoid this repository's content-exclusion
 * policy redacting `Bearer ${...}`-shaped template literals in tooling output.
 */
describe('TEST-F06 current control baselines', () => {
  let coordAToken: string

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
  // for parity/safety with other tests in the same serial run mutating
  // `process.env`.
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

    coordAToken = await realIdTokenForUid(FIXTURE.coordA.uid)
  })

  afterAll(async () => {
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  it('TEST-F06.current-unbounded-request', async () => {
    // `max_tokens: 1000` below is a literal characterization of chat.ts's
    // CURRENT hardcoded value — not an approved budget/SLA. This test only
    // observes that this one bounded, locally-generated synthetic fixture
    // (24 messages × 8,192 chars) is forwarded to the provider without any
    // request-size guard rejecting it first; it does not claim "no bounds
    // exist anywhere" for arbitrarily larger inputs, only that none was
    // observed at this specific tested size.
    const largeContent = 'א'.repeat(8_192)
    const oversizedMessages = Array.from({ length: 24 }, (_, index) => ({
      role: 'user' as const,
      content: `${index}:${largeContent}`,
    }))

    let providerRequest: unknown
    stubAnthropic((parsedRequestBody) => {
      providerRequest = parsedRequestBody
      return anthropicTextReply('synthetic reply')
    })

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: oversizedMessages,
        question: 'האם יש מגבלת גודל?',
      }),
    }))

    expect(res.statusCode).toBe(200)
    expect(providerRequest).toMatchObject({
      max_tokens: 1000,
      messages: oversizedMessages,
    })
  })

  it('TEST-F06.current-nonsettling-provider', async () => {
    stubAnthropic(() => anthropicTextReply('placeholder'))

    // Fix (API strict round2, item A): the resolver/entry-signal are created
    // BEFORE the handler is ever invoked, and the stub records provider
    // entry explicitly. Previously `releaseProviderFetch` was only assigned
    // lazily inside the stub the first time it ran — if the handler's real
    // Firestore I/O (branch/coordinator lookups) took longer than the 500ms
    // watchdog window, the release-at-the-end call ran before the stub had
    // ever been invoked, so it was a no-op; the fetch created afterward then
    // never got released and `await handlerPromise` hung forever. Now we
    // explicitly wait for provider entry first (absorbing whatever real I/O
    // precedes it) before starting the bounded local watchdog measurement,
    // and always release + await the handler in `finally` even if an
    // assertion above throws.
    let resolveProviderFetch!: (response: Response) => void
    const providerFetchPromise = new Promise<Response>((resolve) => {
      resolveProviderFetch = resolve
    })
    let resolveProviderEntered!: () => void
    const providerEnteredPromise = new Promise<void>((resolve) => {
      resolveProviderEntered = resolve
    })

    const previousFetch = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('api.anthropic.com')) {
        resolveProviderEntered()
        return providerFetchPromise
      }
      return previousFetch(input as RequestInfo, init)
    })

    let settled = false
    const handlerPromise = invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'user', content: 'בדיקת timeout' }],
        question: 'בדיקת timeout',
      }),
    }))
    handlerPromise.then(
      () => { settled = true },
      () => { settled = true },
    )

    try {
      // Synchronize on the provider actually being reached first. This
      // absorbs whatever real (unmocked) Firestore I/O the handler performs
      // before it ever calls the provider, so the watchdog window below
      // measures ONLY the handler's own behavior once it is genuinely
      // blocked on the (still-unsettled) provider call — never conflated
      // with real emulator round-trip variance.
      await Promise.race([
        providerEnteredPromise,
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error('provider fetch was never reached within 10s of real handler I/O')),
          10_000,
        )),
      ])

      const raceResult = await Promise.race([
        handlerPromise.then(() => 'handler-settled' as const),
        // A bounded LOCAL TEST HARNESS observation window only, measured
        // from the moment the provider was actually called — never a claim
        // about a production timeout (the handler itself has no such guard).
        new Promise<'watchdog-timeout'>((resolve) => setTimeout(() => resolve('watchdog-timeout'), 500)),
      ])

      expect(raceResult).toBe('watchdog-timeout')
      expect(settled).toBe(false)
    } finally {
      // Release the pending fetch and let the real handler call actually
      // finish before this test (and the process) moves on, so no dangling
      // promise/open handle survives this test — even if an assertion above
      // threw.
      resolveProviderFetch(
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'released-late' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      await handlerPromise
    }
  }, 30000)
})
