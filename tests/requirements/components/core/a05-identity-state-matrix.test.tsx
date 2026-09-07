/**
 * TEST-A05 — identity-state matrix at the UI (component/V) layer.
 *
 * Concrete subcases implemented in this file (see TEST-PLAN.md §6.1 A05 table):
 *
 *   CRM (`/dashboard`)                              — G (3):
 *     TEST-A05.ui.crm.missing-profile
 *     TEST-A05.ui.crm.missing-role
 *     TEST-A05.ui.crm.unknown-role
 *
 *   Admin — expanded across the 4 admin routes     — G (12):
 *     TEST-A05.ui.admin.{missing-profile,missing-role,unknown-role}.{hierarchy,branches,knowledge,report-questions}
 *
 *   Portal (`/portal/home`)                         — G (1), A (2):
 *     TEST-A05.ui.portal.missing-profile           (G)
 *     TEST-A05.ui.portal.missing-role              (A)
 *     TEST-A05.ui.portal.unknown-role              (A)
 *
 *   Inactive characterization                       — C (3):
 *     TEST-A05.inactive.ui.crm
 *     TEST-A05.inactive.ui.admin
 *     TEST-A05.inactive.ui.portal
 *
 * Explicitly NOT implemented here (other agents / other lanes):
 *   - A05.handler.*        → netlify function handlers (functions agent)
 *   - A05.rules.*          → firebase rules-unit-testing (rules agent — see
 *                            tests/requirements/emulator/rules/security-boundaries.test.ts)
 *   - A05.inactive.handler.* / A05.inactive.rules.*  → same as above
 *
 * Baseline predictions (P01, src/App.tsx + src/context/AuthContext.tsx):
 *   - RequireAuth (App.tsx:31-36) only rejects when appUser?.role === 'coordinator';
 *     null / missing-role / unknown-role appUsers all pass through to any CRM /
 *     admin child route — so the G tests here are expected to genuinely FAIL RED.
 *   - RequireCoordinator (App.tsx:38-43) only redirects when appUser && appUser.role !== 'coordinator';
 *     a null appUser (missing-profile) also passes through — G test fails RED.
 *   - AuthContext (AuthContext.tsx:19-40) never reads active — inactive C tests
 *     characterize identical baseline behavior for active:true vs active:false.
 *
 * A positive control identity per surface is asserted in this SAME file so a
 * reviewer can distinguish a genuine denial from a broken harness.
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

/** Seed users/{uid} and drive AuthContext so an identity is authenticated. */
function authenticateAs(spec: {
  uid: string
  email?: string
  profile?: Record<string, unknown> | undefined
}) {
  firestoreMock.setDocValue(`users/${spec.uid}`, spec.profile)
  authMock.currentUser = { uid: spec.uid, email: spec.email }
}

async function feedEmptySnapshots() {
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
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 20))
    for (const path of paths) firestoreMock.emitQuery(path, [])
  }
}

const CRM_HEADING = 'לוח בקרה' // DashboardPage.tsx:149 — matches BOTH the h1 AND the sidebar link, so we always query by heading role to distinguish.

function queryCrmHeading(): HTMLElement | null {
  return screen.queryByRole('heading', { name: CRM_HEADING })
}
function getCrmHeading(): HTMLElement {
  return screen.getByRole('heading', { name: CRM_HEADING })
}

interface AdminRouteSpec {
  id: 'hierarchy' | 'branches' | 'knowledge' | 'report-questions'
  path: string
  distinguishing: string
}
const ADMIN_ROUTES: AdminRouteSpec[] = [
  { id: 'hierarchy',        path: '/admin/hierarchy',        distinguishing: 'הגדרת עץ כפיפויות' },
  { id: 'branches',         path: '/admin/branches',         distinguishing: '+ הוסף סניף' },
  { id: 'knowledge',        path: '/admin/knowledge',        distinguishing: 'ניהול ספריית ידע' },
  { id: 'report-questions', path: '/admin/report-questions', distinguishing: 'עריכת שאלות דיווח רבעוני' },
]

// Portal "did-mount" markers — presence of ANY means CoordinatorPortal was
// allowed to render (RequireCoordinator did NOT redirect).
const PORTAL_MOUNT_MARKERS = [
  'בחר סניף',                          // BranchPicker
  'ברוכים הבאים',                       // PortalHome welcome card
  'אין סניפים מוגדרים למשתמש זה.',      // Zero-branch fallback
]
function portalMounted(): boolean {
  return PORTAL_MOUNT_MARKERS.some((m) => screen.queryByText(m) !== null)
}

// Three invalid identities (independent synthetic fixtures — each test resets).
const INVALID_IDS = {
  'missing-profile': { uid: 'profile-missing',                                                              email: undefined, profile: undefined },
  'missing-role':    { uid: 'role-missing',    email: 'role-missing@example.test',                          profile: { name: 'ללא תפקיד', email: 'role-missing@example.test', active: true } },
  'unknown-role':    { uid: 'role-unknown',    email: 'role-unknown@example.test',                          profile: { name: 'תפקיד לא ידוע', email: 'role-unknown@example.test', role: 'invented-role', active: true } },
} as const
type InvalidId = keyof typeof INVALID_IDS

describe('TEST-A05 identity-state matrix (component/V layer)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
  })

  // ────────────────────────────────────────────────────────────────
  // POSITIVE CONTROLS (harness proofs — not TEST-<ID> requirement rows).
  // ────────────────────────────────────────────────────────────────
  it('positive control: hq-fin sees CRM dashboard at /dashboard', async () => {
    authenticateAs({
      uid: IDENTITIES.hqFin.uid,
      email: IDENTITIES.hqFin.email,
      profile: { name: IDENTITIES.hqFin.name, email: IDENTITIES.hqFin.email, role: IDENTITIES.hqFin.role, active: true },
    })
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    await feedEmptySnapshots()
    await waitFor(() => expect(getCrmHeading()).toBeInTheDocument())
  })

  it('positive control: admin-a sees each admin surface', async () => {
    authenticateAs({
      uid: IDENTITIES.adminA.uid,
      email: IDENTITIES.adminA.email,
      profile: { name: IDENTITIES.adminA.name, email: IDENTITIES.adminA.email, role: IDENTITIES.adminA.role, active: true },
    })
    window.history.pushState({}, '', ADMIN_ROUTES[0].path)
    render(<App />)
    await feedEmptySnapshots()
    await waitFor(() => expect(screen.getByText(ADMIN_ROUTES[0].distinguishing)).toBeInTheDocument())
  })

  it('positive control: coord-a reaches CoordinatorPortal at /portal/home', async () => {
    authenticateAs({
      uid: IDENTITIES.coordA.uid,
      email: IDENTITIES.coordA.email,
      profile: { name: IDENTITIES.coordA.name, email: IDENTITIES.coordA.email, role: 'coordinator', active: true },
    })
    window.history.pushState({}, '', '/portal/home')
    render(<App />)
    await feedEmptySnapshots()
    await waitFor(() => expect(portalMounted()).toBe(true))
  })

  // ────────────────────────────────────────────────────────────────
  // A05.ui.crm.{missing-profile,missing-role,unknown-role} — G × 3
  // ────────────────────────────────────────────────────────────────
  for (const key of Object.keys(INVALID_IDS) as InvalidId[]) {
    it(`TEST-A05.ui.crm.${key} (G): ${key} identity must not see the CRM dashboard at /dashboard`, async () => {
      authenticateAs(INVALID_IDS[key])
      window.history.pushState({}, '', '/dashboard')
      render(<App />)
      await feedEmptySnapshots()
      // Non-inverted G assertion: distinguishing CRM content NOT present.
      // Baseline expectation: this FAILS RED under P01 because RequireAuth
      // (App.tsx:31-36) never rejects these invalid non-coordinator identities.
      await waitFor(() => {
        expect(queryCrmHeading()).not.toBeInTheDocument()
      })
    })
  }

  // ────────────────────────────────────────────────────────────────
  // A05.ui.admin.{missing-profile,missing-role,unknown-role}.{4 routes} — G × 12
  // ────────────────────────────────────────────────────────────────
  for (const key of Object.keys(INVALID_IDS) as InvalidId[]) {
    for (const route of ADMIN_ROUTES) {
      it(`TEST-A05.ui.admin.${key}.${route.id} (G): ${key} identity must not see the admin surface at ${route.path}`, async () => {
        authenticateAs(INVALID_IDS[key])
        window.history.pushState({}, '', route.path)
        render(<App />)
        await feedEmptySnapshots()
        // Baseline: no admin-specific guard exists (App.tsx:73-90) so admin
        // pages mount for ANY authenticated non-coordinator — expected RED.
        await waitFor(() => {
          expect(screen.queryByText(route.distinguishing)).not.toBeInTheDocument()
        })
      })
    }
  }

  // ────────────────────────────────────────────────────────────────
  // A05.ui.portal.missing-profile — G (1)
  // ────────────────────────────────────────────────────────────────
  it('TEST-A05.ui.portal.missing-profile (G): missing-profile identity must not gain portal authority at /portal/home', async () => {
    authenticateAs(INVALID_IDS['missing-profile'])
    window.history.pushState({}, '', '/portal/home')
    render(<App />)
    await feedEmptySnapshots()
    // Baseline: RequireCoordinator (App.tsx:38-43) only redirects when
    // appUser truthy — null passes through → CoordinatorPortal mounts →
    // this assertion fails RED.
    await waitFor(() => {
      expect(portalMounted()).toBe(false)
    })
  })

  // ────────────────────────────────────────────────────────────────
  // A05.ui.portal.{missing-role,unknown-role} — A × 2
  // ────────────────────────────────────────────────────────────────
  for (const key of ['missing-role', 'unknown-role'] as InvalidId[]) {
    it(`TEST-A05.ui.portal.${key} (A): ${key} identity is denied the coordinator surface at /portal/home`, async () => {
      authenticateAs(INVALID_IDS[key])
      window.history.pushState({}, '', '/portal/home')
      render(<App />)
      await feedEmptySnapshots()
      // RequireCoordinator sees appUser truthy with role !== 'coordinator' →
      // redirect to /dashboard. Portal must not mount.
      await waitFor(() => {
        expect(portalMounted()).toBe(false)
      })
      // And the CRM shell (dashboard) IS what appears (behavioral confirmation
      // that redirect took effect, not that everything just failed to mount).
      await waitFor(() => {
        expect(getCrmHeading()).toBeInTheDocument()
      })
    })
  }

  // ────────────────────────────────────────────────────────────────
  // A05.inactive.ui.{crm,admin,portal} — C × 3
  //
  // Compare active flags using a role authorized for each surface.
  // ────────────────────────────────────────────────────────────────

  async function characterizeSurface(spec: {
    profile: Record<string, unknown>
    uid: string
    email: string
    path: string
    expectVisible: (() => HTMLElement) | null
    expectHidden: (() => HTMLElement | null) | null
  }) {
    firestoreMock.reset()
    authMock.reset()
    authenticateAs({ uid: spec.uid, email: spec.email, profile: spec.profile })
    window.history.pushState({}, '', spec.path)
    const { unmount } = render(<App />)
    await feedEmptySnapshots()
    if (spec.expectVisible) {
      await waitFor(() => expect(spec.expectVisible!()).toBeInTheDocument())
    }
    if (spec.expectHidden) {
      expect(spec.expectHidden()).not.toBeInTheDocument()
    }
    unmount()
  }

  it('TEST-A05.inactive.ui.crm (C): active:false FIN and active:true FIN both reach the CRM dashboard identically', async () => {
    // Baseline (characterization): both render the dashboard.
    // Comparison identity — active:true.
    await characterizeSurface({
      uid: IDENTITIES.hqFin.uid,
      email: IDENTITIES.hqFin.email,
      profile: { name: IDENTITIES.hqFin.name, email: IDENTITIES.hqFin.email, role: 'FIN', active: true },
      path: '/dashboard',
      expectVisible: getCrmHeading,
      expectHidden: null,
    })
    // Subject identity — active:false.
    await characterizeSurface({
      uid: IDENTITIES.hqFinInactive.uid,
      email: IDENTITIES.hqFinInactive.email,
      profile: { name: IDENTITIES.hqFinInactive.name, email: IDENTITIES.hqFinInactive.email, role: 'FIN', active: false },
      path: '/dashboard',
      expectVisible: getCrmHeading,
      expectHidden: null,
    })
  })

  it('TEST-A05.inactive.ui.admin (C): active:false and active:true admins both reach admin surfaces identically', async () => {
    const adminRoute = ADMIN_ROUTES[0] // /admin/hierarchy — representative
    await characterizeSurface({
      uid: IDENTITIES.adminA.uid,
      email: IDENTITIES.adminA.email,
      profile: { name: IDENTITIES.adminA.name, email: IDENTITIES.adminA.email, role: 'admin', active: true },
      path: adminRoute.path,
      expectVisible: () => screen.getByText(adminRoute.distinguishing),
      expectHidden: null,
    })
    await characterizeSurface({
      uid: 'admin-inactive',
      email: 'admin-inactive@example.test',
      profile: { name: 'מנהל בדיקה לא פעיל', email: 'admin-inactive@example.test', role: 'admin', active: false },
      path: adminRoute.path,
      expectVisible: () => screen.getByText(adminRoute.distinguishing),
      expectHidden: null,
    })
  })

  it('TEST-A05.inactive.ui.portal (C): active:false and active:true coordinators both reach the portal identically', async () => {
    await characterizeSurface({
      uid: IDENTITIES.coordA.uid,
      email: IDENTITIES.coordA.email,
      profile: { name: IDENTITIES.coordA.name, email: IDENTITIES.coordA.email, role: 'coordinator', active: true },
      path: '/portal/home',
      expectVisible: () => screen.getByText(PORTAL_MOUNT_MARKERS[2]),
      expectHidden: queryCrmHeading,
    })
    await characterizeSurface({
      uid: 'coordinator-inactive',
      email: 'coordinator-inactive@example.test',
      profile: { name: 'רכז בדיקה לא פעיל', email: 'coordinator-inactive@example.test', role: 'coordinator', active: false },
      path: '/portal/home',
      expectVisible: () => screen.getByText(PORTAL_MOUNT_MARKERS[2]),
      expectHidden: queryCrmHeading,
    })
  })
})
