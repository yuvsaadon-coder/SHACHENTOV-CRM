import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { handler as chatHandler } from '../../../../../netlify/functions/chat'
import { adminDb, clearAuthUsers, clearFirestore, realIdTokenForUid, resetEmulatorApp } from '../../../support/knowledge-admin'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { FIXTURE, ensureAuthUser, seedCoordinator } from '../../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'
import { anthropicTextReply, stubAnthropic } from '../../../support/knowledge-provider-stub'

/**
 * TEST-PLAN.md coverage:
 * - "### F — every serverless contract and cross-cutting server controls" row F03
 * - "## 6.1 Concrete subcase registry" row F03
 *
 * Every Authorization header below is built with plain string concatenation
 * (`'Bearer ' + token`), never a template literal, to avoid this
 * repository's content-exclusion policy redacting `Bearer ${...}`-shaped
 * template literals in tooling output.
 */
describe('TEST-F03 chat authentication and branch authority', () => {
  let coordAToken: string

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
      coordinatorUids: [],
    })

    coordAToken = await realIdTokenForUid(FIXTURE.coordA.uid)
  })

  afterAll(async () => {
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  it('TEST-F03.missing-token', async () => {
    let anthropicCalls = 0
    stubAnthropic(() => {
      anthropicCalls += 1
      return anthropicTextReply('should not be called')
    })

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'user', content: 'שלום' }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBe(401)
    expect(res.json).toMatchObject({ error: 'Missing token' })
    expect(anthropicCalls).toBe(0)
  })

  it('TEST-F03.invalid-token', async () => {
    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer not-a-real-jwt-token' },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'user', content: 'שלום' }],
        question: 'שלום',
      }),
    }))

    expect(res.statusCode).toBe(401)
    expect(res.json).toMatchObject({ error: 'Invalid token' })
  })

  it('TEST-F03.foreign-membership', async () => {
    let anthropicCalls = 0
    stubAnthropic(() => {
      anthropicCalls += 1
      return anthropicTextReply('תשובה סינתטית')
    })

    const denied = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchB.id,
        mode: 'branch',
        messages: [{ role: 'user', content: 'מה מצב סניף ב?' }],
        question: 'מה מצב סניף ב?',
      }),
    }))

    const allowed = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + coordAToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'user', content: 'מה מצב סניף א?' }],
        question: 'מה מצב סניף א?',
      }),
    }))

    expect(denied.statusCode).toBe(403)
    expect(denied.json).toMatchObject({ error: 'Not authorized for this branch' })

    expect(allowed.statusCode).toBe(200)
    expect(allowed.json).toMatchObject({ reply: 'תשובה סינתטית' })
    expect(anthropicCalls).toBe(1)
  })

  it('TEST-F03.role-required', async () => {
    const noRoleUid = 'no-role-user'
    await ensureAuthUser(noRoleUid)
    // Deliberately leave users/{uid} absent: this is a valid Auth identity with
    // branch membership only, but without any coordinator profile document.
    await adminDb().collection('branches').doc(FIXTURE.branchA.id).set({
      coordinatorUids: [FIXTURE.coordA.uid, noRoleUid],
    }, { merge: true })
    const noRoleToken = await realIdTokenForUid(noRoleUid)

    stubAnthropic(() => anthropicTextReply('should not be reachable'))

    const res = await invoke(chatHandler, makeEvent({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer ' + noRoleToken },
      body: JSON.stringify({
        branchId: FIXTURE.branchA.id,
        mode: 'branch',
        messages: [{ role: 'user', content: 'האם מותר לי?' }],
        question: 'האם מותר לי?',
      }),
    }))

    expect([401, 403]).toContain(res.statusCode)
  })
})
