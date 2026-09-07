import { describe, expect, it } from 'vitest'
import { handler as aiProxyHandler } from '../../../netlify/functions/ai-proxy'
import { makeEvent, invoke } from '../support/knowledge-netlify-handler'

/**
 * TEST-F10.wrong-method (contracts / behavior lane — network-free).
 * `ai-proxy.ts` makes zero Admin SDK or provider calls for ANY method; the
 * wrong-method case never even reaches the scaffold branch.
 *
 * SCOPE NOTE (post parent infra review): `TEST-F10.post-disabled` moved to
 * `tests/requirements/emulator/knowledge/contracts/F10.test.ts` because its
 * "no mutation occurred" assertion queries the real `tasks` collection via
 * `adminDb()` before/after the call — a genuine live Firestore round trip
 * that must run under the parent's serial emulator wrapper, not this lane.
 */
describe('TEST-F10 ai-proxy disabled write surface (network-free subset)', () => {
  it('TEST-F10.wrong-method', async () => {
    const res = await invoke(aiProxyHandler, makeEvent({ httpMethod: 'GET' }))
    expect(res.statusCode).toBe(405)
  })
})
