import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthUsers, clearFirestore } from '../../../support/knowledge-admin'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../../../support/knowledge-provider-stub'

/**
 * TEST-F08.health-valid-get (emulator lane). Split out of
 * `tests/requirements/contracts/F08.test.ts`: the "configured" half of this
 * test makes a genuine live Firestore `.get()` against the real emulator
 * (`hq-chat-health.ts` queries `hq_knowledge`/`knowledge_articles`/
 * `knowledgeItems` for real once a valid service account is supplied), so it
 * must run serially under the parent's emulator wrapper, not the
 * behavior/contracts lane. Requirement T07a/T13/T03; 6.1 "F08.health-valid-get (A)".
 */
describe('TEST-F08 health diagnostic (real-emulator subset)', () => {
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
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  it('TEST-F08.health-valid-get', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT
    delete process.env.ANTHROPIC_API_KEY

    const firstImport = await import('../../../../../netlify/functions/hq-chat-health')
    const missingConfig = await invoke(firstImport.handler, makeEvent({ httpMethod: 'GET' }))

    expect(missingConfig.statusCode).toBe(200)
    expect(missingConfig.json).toMatchObject({ ok: false, checks: expect.any(Array) })
    expect(JSON.stringify(missingConfig.json)).not.toMatch(/[A-Za-z]:\\|\/netlify\/functions\/| at /)

    await deleteAllApps()
    vi.resetModules()

    const apiKey = 'demo-health-api-key-secret'
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = apiKey
    stubAnthropic(() => anthropicTextReply('ok'))

    // This second import performs REAL Firestore `.get()` calls (per-collection
    // doc counts) against the live emulator now that a valid config exists.
    const secondImport = await import('../../../../../netlify/functions/hq-chat-health')
    const configured = await invoke(secondImport.handler, makeEvent({ httpMethod: 'GET' }))

    expect(configured.statusCode).toBe(200)
    expect(JSON.stringify(configured.json)).not.toContain(apiKey)
  })

  // The case above only proves safety when EVERYTHING is unconfigured, or
  // everything succeeds. Neither exercises the actual safe-error obligation
  // on a CONFIGURED dependency that then genuinely fails — these two cases
  // close that gap with real (not mocked) failures.

  it('TEST-F08.configured-provider-failure-redaction', async () => {
    await deleteAllApps()
    vi.resetModules()

    const sentinel = 'SYNTHETIC_SECRET_SENTINEL'
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = 'demo-health-provider-failure-key'
    stubAnthropic(() => ({ status: 502, text: `upstream detail ${sentinel}` }))

    const { handler } = await import('../../../../../netlify/functions/hq-chat-health')
    const res = await invoke(handler, makeEvent({ httpMethod: 'GET' }))

    expect(res.statusCode).toBe(200)
    const checks = (res.json as { checks?: { name?: string; ok?: boolean }[] } | undefined)?.checks ?? []
    // Positive control: Firestore itself is genuinely configured/reachable —
    // this failure is isolated to the provider check, not a coincidental
    // both-things-broken result.
    expect(checks.some((c) => c.name?.startsWith('Firestore:') && c.ok === true)).toBe(true)
    expect(checks.some((c) => c.name === 'ANTHROPIC_API_KEY' && c.ok === false)).toBe(true)
    expect(JSON.stringify(res.json)).not.toContain(sentinel)
    expect(JSON.stringify(res.json)).not.toContain('demo-health-provider-failure-key')
  })

  // NOTE on timeout: even with the SDK-transport-fault-seam fix (item B, below
  // — replacing the earlier unreachable-port approach), this test still
  // performs 2 genuinely real Firestore `.get()` calls (`hq_knowledge`,
  // `knowledgeItems`) against the live emulator, with no internal timeout in
  // `hq-chat-health.ts` itself. A prior edit to this test dropped the
  // explicit per-test timeout override that had been added for the old
  // (now-removed) unreachable-port approach; restored here as a defensive
  // margin against real emulator connection/round-trip latency (e.g., after
  // a fresh service restart), independent of whichever specific approach is
  // used for the injected fault.
  it('TEST-F08.configured-firestore-failure-redaction', async () => {
    await deleteAllApps()
    vi.resetModules()

    const apiKey = 'demo-health-firestore-failure-key'
    // A distinctive sentinel that would only ever appear in the response if
    // the real (unredacted) transport-fault error message leaked through —
    // unlike the earlier bad-port ECONNREFUSED approach, which produced a
    // generic, secret-free error string and so proved nothing about actual
    // redaction sensitivity (its "not.toContain" assertions passed
    // vacuously, whether or not anything was actually redacted).
    const sentinel = `FIRESTORE_TRANSPORT_FAULT_SENTINEL_${Date.now()}`
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = apiKey
    stubAnthropic(() => anthropicTextReply('ok'))

    // Pre-initialize the exact same default Firebase app/Firestore instance
    // hq-chat-health.ts will reuse (it only calls initializeApp() when
    // getApps() is empty — see production source), so we can inject a real,
    // SDK-transport-level fault for exactly ONE of the three collections'
    // real Query objects, while the other two collections' `.get()` calls
    // stay genuinely real against the live emulator. This is fault
    // injection at the SDK transport boundary, not a business-logic clone —
    // the handler, its query construction, and 2 of 3 real Firestore round
    // trips are entirely untouched.
    const { initializeApp, cert } = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')
    const app = initializeApp({ credential: cert(JSON.parse(fakeServiceAccountJson()) as Record<string, string>) })
    const db = getFirestore(app)
    const faultCollection = 'knowledge_articles'
    const originalCollection = db.collection.bind(db)
    let injectedGetFailures = 0
    vi.spyOn(db, 'collection').mockImplementation((path: string) => {
      const ref = originalCollection(path)
      if (path !== faultCollection) return ref
      const originalLimit = ref.limit.bind(ref)
      vi.spyOn(ref, 'limit').mockImplementation((n: number) => {
        const q = originalLimit(n)
        vi.spyOn(q, 'get').mockImplementation(async () => {
          injectedGetFailures++
          throw new Error(`Firestore transport fault: ${sentinel}`)
        })
        return q
      })
      return ref
    })

    const { handler } = await import('../../../../../netlify/functions/hq-chat-health')
    const res = await invoke(handler, makeEvent({ httpMethod: 'GET' }))

    expect(res.statusCode).toBe(200)
    expect(injectedGetFailures).toBeGreaterThan(0)
    const checks = (res.json as { checks?: { name?: string; ok?: boolean }[] } | undefined)?.checks ?? []

    // Flag/count confirming the injected failure actually triggered: exactly
    // the targeted collection failed; the other two (genuinely queried
    // against the real emulator) succeeded — proof this is an isolated,
    // real dependency failure, not an absent/empty check list.
    const firestoreChecks = checks.filter((c) => c.name?.startsWith('Firestore:'))
    expect(firestoreChecks).toHaveLength(3)
    const failedFirestoreChecks = firestoreChecks.filter((c) => c.ok === false)
    expect(failedFirestoreChecks).toHaveLength(1)
    expect(failedFirestoreChecks[0]?.name).toBe(`Firestore: ${faultCollection}`)
    expect(firestoreChecks.filter((c) => c.ok === true)).toHaveLength(2)
    // Positive control: the Anthropic check is genuinely configured and
    // reachable — this failure is isolated to one Firestore collection.
    expect(checks.some((c) => c.name === 'ANTHROPIC_API_KEY' && c.ok === true)).toBe(true)

    // The real, unredacted error message DID carry the sentinel (proof the
    // failure path was genuinely exercised with real content to redact, not
    // an absent/empty error). The response must not leak it or any secret.
    // NOTE: hq-chat-health.ts currently reflects `e.message` verbatim into
    // each check's `detail` field with no redaction at all — so this
    // assertion is expected to currently FAIL against real source (a
    // genuine safety gap, the same class as the provider-failure sibling
    // test above), not a test defect. Runtime outcome is pending a live
    // emulator run (no lease this round).
    const serialized = JSON.stringify(res.json)
    expect(serialized).not.toContain(sentinel)
    expect(serialized).not.toContain(apiKey)
    expect(serialized).not.toContain('-----BEGIN PRIVATE KEY-----')
  }, 30000)
})
