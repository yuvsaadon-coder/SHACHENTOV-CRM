import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { handler as portalLoginHandler } from '../../../../../netlify/functions/portal-login'
import {
  adminApp,
  adminDb,
  clearAuthUsers,
  clearFirestore,
  exchangeCustomToken,
  resetEmulatorApp,
} from '../../../support/knowledge-admin'
import { fakeServiceAccountJson } from '../../../support/knowledge-fake-service-account'
import { FIXTURE, ensureAuthUser, seedCoordinator } from '../../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../../support/knowledge-netlify-handler'

/**
 * TEST-PLAN.md coverage:
 * - "### F — every serverless contract and cross-cutting server controls" row F02
 * - "## 6.1 Concrete subcase registry" row F02
 */
describe('TEST-F02 portal-login lookup and failure surface', () => {
  async function deleteAllApps() {
    await resetEmulatorApp()
    await Promise.all(getApps().map(async (app) => {
      await deleteApp(app)
    }))
  }

  async function seedBaseCoordinator() {
    await seedCoordinator({
      uid: FIXTURE.coordA.uid,
      name: FIXTURE.coordA.name,
      phone: FIXTURE.coordA.phone,
      branchId: FIXTURE.branchA.id,
      branchName: FIXTURE.branchA.name,
    })
  }

  async function portalLogin(name: string, phone: string) {
    return invoke(portalLoginHandler, makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ name, phone }),
    }))
  }

  async function expectNormalizedUidSuccess(expectedUid = FIXTURE.coordA.uid) {
    const res = await portalLogin(`  ${FIXTURE.coordA.name}  `, ' 050-111-2222 ')
    expect(res.statusCode).toBe(200)

    const token = (res.json as { token: string }).token
    const { idToken } = await exchangeCustomToken(token)
    const decoded = await getAuth(adminApp()).verifyIdToken(idToken)
    expect(decoded.uid).toBe(expectedUid)
  }

  beforeAll(async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    await clearFirestore()
    await clearAuthUsers()
  })

  beforeEach(async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccountJson()
    await deleteAllApps()
    await clearFirestore()
    await clearAuthUsers()
    await seedBaseCoordinator()
  })

  afterAll(async () => {
    await clearFirestore()
    await clearAuthUsers()
    await deleteAllApps()
  })

  it('TEST-F02.normalized-uid-success', async () => {
    await expectNormalizedUidSuccess()
  })

  it('TEST-F02.non-enumerating-failure', async () => {
    await expectNormalizedUidSuccess()

    const missingName = await portalLogin('רכזת שלא קיימת', FIXTURE.coordA.phone)
    const wrongPhone = await portalLogin(FIXTURE.coordA.name, '050-999-9999')

    expect(missingName.statusCode).toBe(401)
    expect(wrongPhone.statusCode).toBe(401)

    expect(missingName.body).not.toContain(FIXTURE.coordA.name)
    expect(missingName.body).not.toContain(FIXTURE.coordA.uid)
    expect(wrongPhone.body).not.toContain(FIXTURE.coordA.name)
    expect(wrongPhone.body).not.toContain(FIXTURE.coordA.uid)

    expect(missingName.body).toBe(wrongPhone.body)
  })

  it('TEST-F02.empty-digits-denial', async () => {
    await expectNormalizedUidSuccess()

    const emptyDigitsName = 'רכזת ספרות ריקות'
    const emptyDigitsUid = 'coord-empty-digits'
    await ensureAuthUser(emptyDigitsUid)
    await adminDb().collection('users').doc(emptyDigitsUid).set({
      name: emptyDigitsName,
      phone: '---',
      role: 'coordinator',
      active: true,
    })

    const res = await portalLogin(emptyDigitsName, '---')

    expect(res.statusCode).not.toBe(200)
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })

  it('TEST-F02.current-name-query-limit', async () => {
    await expectNormalizedUidSuccess()

    // Firestore's documented default order (no explicit orderBy) is ascending
    // by document ID: https://firebase.google.com/docs/firestore/query-data/order-limit-data
    // Using six deterministic, already-ascending doc IDs ('coord-shared-01'
    // .. '-06') means the real `.limit(5)` query in portal-login.ts is known
    // in advance to return exactly IDs 01-05 and exclude 06 — no query is
    // run here to DECIDE the expectation; the expectation is fixed before any
    // assertion, and only the real handler's own behavior is observed against
    // it. This characterizes the current truncation (C), it does not approve
    // limit(5) as a normative capacity policy.
    const sharedName = 'רכזת עומס שם משותף'
    for (let index = 1; index <= 6; index += 1) {
      const uid = `coord-shared-0${index}`
      await seedCoordinator({
        uid,
        name: sharedName,
        phone: `050-000-000${index}`,
        branchId: `branch-shared-0${index}`,
        branchName: `סניף משותף ${index}`,
      })
    }

    // Positive control: the 5th doc (within the real query's limit(5) window
    // given ascending-by-ID order) must genuinely succeed.
    const withinLimit = await portalLogin(sharedName, '050-000-0005')
    expect(withinLimit.statusCode).toBe(200)
    const token = (withinLimit.json as { token: string }).token
    const { idToken } = await exchangeCustomToken(token)
    const decoded = await getAuth(adminApp()).verifyIdToken(idToken)
    expect(decoded.uid).toBe('coord-shared-05')

    // Characterization: the 6th doc, excluded by the real query's limit(5)
    // given ascending-by-ID order, is genuinely truncated out and denied.
    const truncated = await portalLogin(sharedName, '050-000-0006')
    expect(truncated.statusCode).toBe(401)
  })
})
