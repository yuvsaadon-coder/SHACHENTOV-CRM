import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { handler as chatHandler } from '../../../../../netlify/functions/chat'
import { handler as hqChatHandler } from '../../../../../netlify/functions/hq-chat'
import { handler as portalLoginHandler } from '../../../../../netlify/functions/portal-login'
import { adminDb, clearAuthUsers, clearFirestore, resetEmulatorApp, realIdTokenForUid } from '../../../support/knowledge-admin'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { FIXTURE, seedCoordinator, seedHqUser } from '../../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../../../support/knowledge-provider-stub'

/**
 * TEST-PLAN.md coverage:
 * - "### F — every serverless contract and cross-cutting server controls" row F07
 * - Family-level concrete sentinel-leak cases (no 6.1 split row exists for F07)
 *
 * Authorization headers use plain string concatenation (`'Bearer ' + token`),
 * never a template literal, to avoid this repository's content-exclusion
 * policy redacting `Bearer ${...}`-shaped template literals in tooling
 * output — this was previously ambiguous in this file (rendered as `******`
 * in every viewer) and has been rewritten explicitly to remove that
 * ambiguity. `chat.*` uses `coordAToken`; `hq-chat.*` uses `hqToken`.
 */
describe('TEST-F07 failure details must not leak secrets or internals', () => {
  const SYNTHETIC_SECRET_SENTINEL = 'SYNTHETIC_SECRET_SENTINEL'

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
  // for parity/safety with the portal-login test below, which
  // intentionally deletes/restores FIREBASE_SERVICE_ACCOUNT itself for its
  // own config-failure case.
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
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = 'demo-anthropic-key'
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  it('TEST-F07.chat.provider-error-redaction', async () => {
    stubAnthropic(() => ({ status: 502, text: `upstream detail ${SYNTHETIC_SECRET_SENTINEL}` }))

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'user', content: 'שלום' }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBe(502)
    expect(res.body ?? '').not.toContain(SYNTHETIC_SECRET_SENTINEL)
  })

  it('TEST-F07.hq-chat.provider-error-redaction', async () => {
    stubAnthropic(() => ({
      status: 502,
      text: JSON.stringify({ error: { message: `provider detail ${SYNTHETIC_SECRET_SENTINEL}` } }),
    }))

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({
        scopes: ['hq'],
        messages: [{ role: 'user', content: 'שלום' }],
      }),
    }))

    expect(res.statusCode).toBe(502)
    expect(res.body ?? '').not.toContain(SYNTHETIC_SECRET_SENTINEL)
  })

  it('TEST-F07.hq-chat.partial-source-error-redaction', async () => {
    const providerRequests: unknown[] = []
    stubAnthropic((body) => {
      providerRequests.push(body)
      return anthropicTextReply('תשובה סינתטית')
    })

    // Fix (API strict round2, item C): `domainFilter: [SENTINEL]` (an array,
    // where hq-chat.ts's own type expects a string|null) does NOT guarantee a
    // throw — Firestore's `in` filter accepts array-typed comparison values,
    // so that query can genuinely succeed empty with no error at all, making
    // the prior version's "200 + sentinel absent" a false pass that never
    // proved anything. This version instead injects a REAL SDK-transport-
    // level fault on exactly the 'hq' source's real Firestore Query (the
    // 'global' source's real query is untouched and must genuinely succeed
    // for real, seeded below as a positive control) — no malformed-input
    // guessing, no post-hoc data manipulation.
    const marker = `REAL_GLOBAL_SOURCE_MARKER_${Date.now()}`
    await adminDb().collection('knowledgeItems').add({
      branchId: 'global',
      title: marker,
      content: marker,
      type: 'note',
    })

    const db = adminDb()
    const originalCollection = db.collection.bind(db)
    let injectedGetFailures = 0
    const collectionSpy = vi.spyOn(db, 'collection').mockImplementation((path: string) => {
      const ref = originalCollection(path)
      if (path !== 'hq_knowledge') return ref
      const originalLimit = ref.limit.bind(ref)
      vi.spyOn(ref, 'limit').mockImplementation((n: number) => {
        const q = originalLimit(n)
        vi.spyOn(q, 'get').mockImplementation(async () => {
          injectedGetFailures++
          throw new Error(`hq source transport fault: ${SYNTHETIC_SECRET_SENTINEL}`)
        })
        return q
      })
      return ref
    })

    try {
      const res = await invoke(hqChatHandler, makeEvent({
        httpMethod: 'POST',
        headers: { authorization: 'Bearer ' + hqToken },
        body: JSON.stringify({
          scopes: ['hq', 'global'],
          messages: [{ role: 'user', content: 'שלום' }],
        }),
      }))

      expect(res.statusCode).toBe(200)
      const body = res.body ?? ''
      // Positive control: the 'global' source's real Firestore query was
      // genuinely untouched and must have actually succeeded — proof the
      // injected fault is isolated to the 'hq' source, not a wholesale
      // Firestore outage or an empty-by-coincidence result.
      expect(injectedGetFailures).toBeGreaterThan(0)
      expect(providerRequests).toHaveLength(1)
      expect(providerRequests[0]).toMatchObject({ system: expect.stringContaining(marker) })
      // Flag confirming the 'hq' source's failure path actually triggered
      // (not silently empty/absent): production's own `collect()` helper
      // records a warning labelled with the Hebrew source name whenever a
      // source throws.
      expect(body).toContain('מאגר מטה')
      expect(body).toContain('מקורות שלא נטענו')
      // The real, unredacted error message DID carry the sentinel — this
      // assertion is expected to currently FAIL against real source (a
      // genuine leak: hq-chat.ts appends `sourceWarnings` — including the
      // raw caught error message — verbatim into the client-visible reply
      // with no redaction at all), the same class of gap as the two
      // provider-error-redaction tests above. Runtime outcome is pending a
      // live emulator run (no lease this round).
      expect(body).not.toContain(SYNTHETIC_SECRET_SENTINEL)
    } finally {
      collectionSpy.mockRestore()
    }
  })

  it('TEST-F07.portal-login.config-error-safe', async () => {
    await deleteAllApps()
    delete process.env.FIREBASE_SERVICE_ACCOUNT

    try {
      const res = await invoke(portalLoginHandler, makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ name: FIXTURE.coordA.name, phone: FIXTURE.coordA.phone }),
      }))

      expect(res.statusCode).toBe(500)
      expect(res.body ?? '').not.toContain(SYNTHETIC_SECRET_SENTINEL)
      expect(res.body ?? '').not.toMatch(/[A-Za-z]:\\|\/netlify\/functions\/| at /)
    } finally {
      process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    }
  })
})
