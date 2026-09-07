import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { handler as hqChatHandler } from '../../../../../netlify/functions/hq-chat'
import { adminDb, clearAuthUsers, clearFirestore, realIdTokenForUid, resetEmulatorApp } from '../../../support/knowledge-admin'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { FIXTURE, ensureAuthUser, seedCoordinator, seedHqUser } from '../../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../../../support/knowledge-provider-stub'

/**
 * TEST-PLAN.md coverage:
 * - "### F — every serverless contract and cross-cutting server controls" row F04
 * - "## 6.1 Concrete subcase registry" row F04
 *
 * Every Authorization header below is built with plain string concatenation
 * (`'Bearer ' + token`), never a template literal, to avoid this
 * repository's content-exclusion policy redacting `Bearer ${...}`-shaped
 * template literals in tooling output.
 */
describe('TEST-F04 hq-chat authorization contracts', () => {
  let coordAToken: string
  let hqToken: string
  let missingProfileToken: string
  let missingRoleToken: string
  let unknownRoleToken: string

  async function deleteAllApps() {
    await resetEmulatorApp()
    await Promise.all(getApps().map(async (app) => {
      await deleteApp(app)
    }))
  }

  beforeEach(async () => {
    await deleteAllApps()
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    process.env.ANTHROPIC_API_KEY = 'demo-anthropic-key'

    await clearFirestore()
    await clearAuthUsers()

    await seedHqUser({ uid: FIXTURE.hq.uid, name: FIXTURE.hq.name, role: FIXTURE.hq.domain })
    await seedHqUser({ uid: FIXTURE.admin.uid, name: FIXTURE.admin.name, role: 'admin' })
    await seedCoordinator({
      uid: FIXTURE.coordA.uid,
      name: FIXTURE.coordA.name,
      phone: FIXTURE.coordA.phone,
      branchId: FIXTURE.branchA.id,
      branchName: FIXTURE.branchA.name,
    })

    await ensureAuthUser('missing-profile-user')
    await ensureAuthUser('missing-role-user')
    await adminDb().collection('users').doc('missing-role-user').set({
      name: 'משתמש בלי role',
      active: true,
    })
    await ensureAuthUser('unknown-role-user')
    await adminDb().collection('users').doc('unknown-role-user').set({
      name: 'משתמש role לא מוכר',
      role: 'invented-role-xyz',
      active: true,
    })

    coordAToken = await realIdTokenForUid(FIXTURE.coordA.uid)
    hqToken = await realIdTokenForUid(FIXTURE.hq.uid)
    missingProfileToken = await realIdTokenForUid('missing-profile-user')
    missingRoleToken = await realIdTokenForUid('missing-role-user')
    unknownRoleToken = await realIdTokenForUid('unknown-role-user')
  })

  afterAll(async () => {
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  it('TEST-F04.coordinator-denial', async () => {
    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        scopes: ['hq'],
        messages: [{ role: 'user', content: 'שלום' }],
      }),
    }))

    expect(res.statusCode).toBe(403)
  })

  it('TEST-F04.missing-profile-denial', async () => {
    let anthropicCalls = 0
    stubAnthropic(() => { anthropicCalls += 1; return anthropicTextReply('should not be reachable') })

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + missingProfileToken },
      body: JSON.stringify({
        scopes: ['hq'],
        messages: [{ role: 'user', content: 'שלום' }],
      }),
    }))

    // The firm requirement is denial (no privileged HQ access without a
    // defined role) — the raw spec doesn't mandate an exact 403 vs another
    // 4xx, so assert the real, broader requirement: not success, and no
    // provider call made on this request.
    expect(res.statusCode).not.toBe(200)
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
    expect(anthropicCalls).toBe(0)
  })

  it('TEST-F04.missing-role-denial', async () => {
    let anthropicCalls = 0
    stubAnthropic(() => { anthropicCalls += 1; return anthropicTextReply('should not be reachable') })

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + missingRoleToken },
      body: JSON.stringify({
        scopes: ['hq'],
        messages: [{ role: 'user', content: 'שלום' }],
      }),
    }))

    expect(res.statusCode).not.toBe(200)
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
    expect(anthropicCalls).toBe(0)
  })

  it('TEST-F04.unknown-role-denial', async () => {
    let anthropicCalls = 0
    stubAnthropic(() => { anthropicCalls += 1; return anthropicTextReply('should not be reachable') })

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + unknownRoleToken },
      body: JSON.stringify({
        scopes: ['hq'],
        messages: [{ role: 'user', content: 'שלום' }],
      }),
    }))

    expect(res.statusCode).not.toBe(200)
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
    expect(anthropicCalls).toBe(0)
  })

  it('TEST-F04.valid-hq-success', async () => {
    stubAnthropic(() => anthropicTextReply('תשובת מטה סינתטית'))

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({
        scopes: ['hq'],
        messages: [{ role: 'user', content: 'יש שאלה למטה' }],
      }),
    }))

    expect(res.statusCode).toBe(200)
    expect(res.json).toMatchObject({ reply: 'תשובת מטה סינתטית' })
  })

  it('TEST-F04.domain-access-current', async () => {
    const sentinel = 'VOL-SENTINEL-cross-domain'
    await adminDb().collection('hq_knowledge').doc('vol-only').set({
      domain: 'VOL',
      category: 'volunteers',
      title: 'ידע VOL בלבד',
      content: `תוכן פנימי ${sentinel}`,
    })

    let providerRequest: unknown
    stubAnthropic((parsedRequestBody) => {
      providerRequest = parsedRequestBody
      return anthropicTextReply('תשובה סינתטית')
    })

    const res = await invoke(hqChatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + hqToken },
      body: JSON.stringify({
        scopes: ['hq'],
        domainFilter: 'VOL',
        messages: [{ role: 'user', content: 'האם רואים ידע של VOL?' }],
      }),
    }))

    expect(res.statusCode).toBe(200)
    expect((providerRequest as { system?: string } | undefined)?.system).toContain(sentinel)
  })
})
