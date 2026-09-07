/**
 * TEST-A06 — non-admin cannot reach admin surfaces directly.
 *
 * Concrete subcases (see TEST-PLAN.md §6.1 "Other mixed families" A06 row):
 *   - TEST-A06.ui.hierarchy         (G)
 *   - TEST-A06.ui.branches          (G)
 *   - TEST-A06.ui.knowledge         (G)
 *   - TEST-A06.ui.report-questions  (G)
 *
 * Each: authenticated hq-fin opens the admin route directly; the admin page must
 * not render (its distinguishing h1 must be absent). Positive control in the
 * SAME test proves the admin (admin-a) sees the page — so a passing denial is a
 * real guard, not an empty harness.
 *
 * Baseline (P01): src/App.tsx only wraps `/admin/*` in RequireAuth, which
 * accepts any authenticated non-coordinator profile — hq-fin therefore passes
 * through and the admin page renders. src/components/layout/Sidebar.tsx (~lines
 * 76-81) only *hides* admin links from the sidebar; it enforces no route guard.
 * These G tests are therefore expected to fail RED against the current code —
 * that IS the reported gap; the assertion is written non-inverted per the spec.
 *
 * `A06.mutation.*` (client-invoked-operation-denied-by-rules variant) is out of
 * scope for the UI/component lane — it requires real Firestore Security Rules
 * enforcement via @firebase/rules-unit-testing (owned by the rules agent).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const { buildFirestoreMock } = await import('../../support/core-firestore-mock')
  const base = buildFirestoreMock(actual) as Record<string, unknown>
  base.getDocs = vi.fn(async () => ({
    docs: [] as unknown[], size: 0, empty: true, forEach: () => {},
  }))
  return base
})

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>()
  const { buildAuthMock } = await import('../../support/core-auth-mock')
  return buildAuthMock(actual)
})

import { firestoreMock } from '../../support/core-firestore-mock'
import { authMock } from '../../support/core-auth-mock'
import { IDENTITIES } from '../../support/core-fixtures'
import App from '../../../../src/App'

/** Seed a users/{uid} profile and drive AuthContext with a matching firebase user. */
function authenticateAs(identity: { uid: string; email?: string; name?: string; role?: string; active?: boolean }) {
  firestoreMock.setDocValue(`users/${identity.uid}`, {
    ...(identity.name !== undefined ? { name: identity.name } : {}),
    ...(identity.email !== undefined ? { email: identity.email } : {}),
    ...(identity.role !== undefined ? { role: identity.role } : {}),
    ...(identity.active !== undefined ? { active: identity.active } : {}),
  })
  authMock.currentUser = { uid: identity.uid, email: identity.email }
}

/** Once render() has begun, emit empty snapshots so any admin page can settle past its own `if (loading)` gate. */
async function feedAdminPageEmptySnapshots() {
  const paths = [
    'branches',
    'quarterlyReports',
    'reportQuestions',
    'tasks',
    'roles',
    'contacts',
    'knowledgeItems',
    'hq_knowledge',
  ]
  // Emit repeatedly with real timer ticks so listeners that register after
  // AuthContext resolves also receive their empty snapshot. Pages that use
  // getDocs only don't need any emit — the mocked getDocs already resolved.
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 20))
    for (const path of paths) firestoreMock.emitQuery(path, [])
  }
}

interface AdminRouteSpec {
  id: 'hierarchy' | 'branches' | 'knowledge' | 'report-questions'
  path: string
  /** Text unique to that admin page's rendered surface — h1 or a clearly-admin control. */
  distinguishing: string
}

const ADMIN_ROUTES: AdminRouteSpec[] = [
  { id: 'hierarchy',        path: '/admin/hierarchy',        distinguishing: 'הגדרת עץ כפיפויות' },
  { id: 'branches',         path: '/admin/branches',         distinguishing: '+ הוסף סניף' },
  { id: 'knowledge',        path: '/admin/knowledge',        distinguishing: 'ניהול ספריית ידע' },
  { id: 'report-questions', path: '/admin/report-questions', distinguishing: 'עריכת שאלות דיווח רבעוני' },
]

describe('TEST-A06 non-admin denied at /admin/* routes (component/V layer)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
  })

  for (const route of ADMIN_ROUTES) {
    // Independent (G) denial test per admin route.
    it(`TEST-A06.ui.${route.id} (G): hq-fin directly opening ${route.path} must not see the admin surface`, async () => {
      authenticateAs(IDENTITIES.hqFin)
      window.history.pushState({}, '', route.path)

      render(<App />)
      await feedAdminPageEmptySnapshots()

      // waitFor lets any redirect or state-settle complete. Assertion is
      // non-inverted: distinguishing admin content must NOT appear.
      // Baseline: RequireAuth only rejects coordinators, hq-fin (role FIN)
      // passes through → admin page mounts → this assertion FAILS red as
      // documented above.
      await waitFor(() => {
        expect(screen.queryByText(route.distinguishing)).not.toBeInTheDocument()
      })
    })

    // Positive control (harness proof): admin-a on the same route must SEE the surface,
    // so the denial assertion above proves real enforcement, not a broken harness.
    it(`positive control: admin-a directly opening ${route.path} sees the admin surface (${route.id})`, async () => {
      authenticateAs(IDENTITIES.adminA)
      window.history.pushState({}, '', route.path)

      render(<App />)
      await feedAdminPageEmptySnapshots()

      await waitFor(() => {
        expect(screen.getByText(route.distinguishing)).toBeInTheDocument()
      })
    })
  }
})
