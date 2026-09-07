/**
 * TEST-A07 — coordinator branch-membership transitions in the portal picker/home.
 *
 * Concrete subcase (single entry, single classification per §6.1 table row A07):
 *   - TEST-A07.ui.branch-membership-transitions (A)
 *
 * GIVEN coord-a belongs to branches A and C; WHEN logging in, picking C, then a
 * membership snapshot removes A, then all memberships are removed; THEN
 * picker/home reflects current membership, no foreign branch (branch-b, branch-d)
 * shown, and zero-branch exit remains usable.
 *
 * This exercises real CoordinatorPortal + real useBranch (a live onSnapshot on
 * `branches` filtered by array-contains coord-a) — no hook is mocked.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
import { IDENTITIES, BRANCHES, docSnap } from '../../support/core-fixtures'
import App from '../../../../src/App'

describe('TEST-A07 branch-membership transitions (real CoordinatorPortal + useBranch)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    window.history.pushState({}, '', '/portal/home')
  })

  it('TEST-A07.ui.branch-membership-transitions (A): picker/home follow membership updates and zero-branch exit stays usable', async () => {
    // coord-a is a real coordinator; seed profile so AuthContext accepts them
    // and RequireCoordinator passes.
    firestoreMock.setDocValue(`users/${IDENTITIES.coordA.uid}`, {
      name: IDENTITIES.coordA.name,
      email: IDENTITIES.coordA.email,
      role: 'coordinator',
      active: true,
    })
    authMock.currentUser = { uid: IDENTITIES.coordA.uid, email: IDENTITIES.coordA.email }
    // needed by useAllReportQuestions (PortalHome dependency)
    // — empty snapshot arrives once the listener registers below.

    render(<App />)

    // Wait for the useBranch onSnapshot listener to register before emitting.
    await waitFor(() => expect(firestoreMock.liveCount('branches')).toBe(1))

    // (1) Initial snapshot: coord-a is on branch-a AND branch-c (two memberships).
    firestoreMock.emitQuery('branches', [
      docSnap(BRANCHES.a),
      docSnap(BRANCHES.c),
    ])
    // Also emit reportQuestions listeners the portal home may register once mounted.
    firestoreMock.emitQuery('reportQuestions', [])

    // Two branches → BranchPicker screen with "בחר סניף".
    await screen.findByText('בחר סניף')
    // Both branches offered; no foreign branch-b/branch-d shown.
    expect(screen.getByText(BRANCHES.a.name)).toBeInTheDocument()
    expect(screen.getByText(BRANCHES.c.name)).toBeInTheDocument()
    expect(screen.queryByText(BRANCHES.b.name)).not.toBeInTheDocument()
    expect(screen.queryByText(BRANCHES.d.name)).not.toBeInTheDocument()

    // (2) Simulate selecting branch-c.
    await userEvent.click(screen.getByText(BRANCHES.c.name))

    // Once selected, PortalHome renders inside the portal shell with the
    // branch's welcome card (branch name appears in the header + welcome card).
    // Wait for quarterlyReports listener registration (branch=c filter).
    await screen.findByText('ברוכים הבאים')
    // The header should display the currently selected branch's name.
    expect(screen.getAllByText(BRANCHES.c.name).length).toBeGreaterThan(0)

    // (3) Re-emit branches snapshot where branch-a no longer includes coord-a
    // — but branch-c still does. Picker/home must now only reflect branch-c.
    firestoreMock.emitQuery('branches', [docSnap(BRANCHES.c)])

    // Still on branch-c; branch-a's name must be gone from the shell.
    await waitFor(() => {
      expect(screen.queryByText(BRANCHES.a.name)).not.toBeInTheDocument()
    })
    // Foreign branches never appear.
    expect(screen.queryByText(BRANCHES.b.name)).not.toBeInTheDocument()
    expect(screen.queryByText(BRANCHES.d.name)).not.toBeInTheDocument()

    // (4) Final snapshot: coord-a removed from all branches — zero memberships.
    firestoreMock.emitQuery('branches', [])

    // Portal's zero-branch fallback must render and remain usable
    // (i.e. show the "אין סניפים מוגדרים למשתמש זה" line and an actionable
    // logout button — not a crash or blank screen).
    await screen.findByText('אין סניפים מוגדרים למשתמש זה.')
    const logoutBtn = screen.getByRole('button', { name: 'יציאה' })
    expect(logoutBtn).toBeEnabled()
  })
})
