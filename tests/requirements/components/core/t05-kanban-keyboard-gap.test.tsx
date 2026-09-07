/**
 * TEST-T05 — Kanban status-change accessibility (V-lane portion).
 *
 * Requirements: T02 / T10a / T14b. Layer V. Family classification per the
 * parent-corrected §6.1 registry: `keyboard-equivalent-status-change` (A).
 *
 * Raw requirement (TEST-PLAN.md §6 T05): "...keyboard user can complete
 * equivalent status change with focus retained." The Hebrew technical
 * spec's "Kanban נגיש" (accessible Kanban) clause does not mandate a
 * dnd-kit KeyboardSensor specifically — `KanbanCard.tsx:58-66` already
 * renders a native `<select>` status control, independent of dnd-kit,
 * that is the real accessible equivalent path this requirement asks for.
 *
 * Scope honesty: this V-lane test proves the real component/SDK
 * contract — reaching the real select via Tab (a real keyboard action)
 * and confirming the resulting write/state, with focus retained. It does
 * NOT by itself prove full native `<select>` keyboard-gesture fidelity
 * (raw ArrowDown/Enter key dispatch opening/closing the OS-level
 * dropdown) — jsdom's `<select>` value-change here is driven through
 * Testing Library's `selectOptions` helper, which is a reliable proxy for
 * the resulting DOM/state contract but is not itself a literal physical
 * key-press sequence. The browser/Playwright lane owns strengthening this
 * with real key dispatch against a real rendering engine.
 *
 * NOT-EXECUTED here (out of V-scope; belongs to the B/Playwright lane,
 * also (A) per the corrected registry — not claimed as a confirmed
 * defect here, just genuinely unsupported at this layer):
 *   - Pointer-drag physics (real dnd-kit PointerSensor + collision
 *     detection). jsdom cannot faithfully simulate pointer capture.
 *   - Cancelled-drop / same-column-drop write suppression.
 *
 * The separate `failed-write-observable` (G) subcase is not implemented
 * in this file — it requires a real failed-write UI feedback assertion
 * and is left to a follow-up pass.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const { buildFirestoreMock } = await import('../../support/core-firestore-mock')
  return buildFirestoreMock(actual)
})

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>()
  const { buildAuthMock } = await import('../../support/core-auth-mock')
  return buildAuthMock(actual)
})

import { firestoreMock } from '../../support/core-firestore-mock'
import { authMock } from '../../support/core-auth-mock'
import { IDENTITIES, TASKS } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { KanbanView } from '../../../../src/components/kanban/KanbanView'
import type { Task } from '../../../../src/types'

function authenticateAdmin() {
  firestoreMock.setDocValue(`users/${IDENTITIES.adminA.uid}`, {
    name: IDENTITIES.adminA.name,
    email: IDENTITIES.adminA.email,
    role: IDENTITIES.adminA.role,
    active: true,
  })
  authMock.currentUser = { uid: IDENTITIES.adminA.uid, email: IDENTITIES.adminA.email }
}

describe('TEST-T05 — Kanban status-change accessibility (V, family=A)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    authenticateAdmin()
  })

  it('TEST-T05.keyboard-equivalent-status-change (A) — Tab reaches the native status control, changing it writes the real status update, and focus is retained', async () => {
    const user = userEvent.setup()
    const finInWork = { ...TASKS.fin, status: 'בעבודה' as const } as unknown as Task
    render(
      <AuthProvider>
        <MemoryRouter>
          <KanbanView tasks={[finInWork]} />
        </MemoryRouter>
      </AuthProvider>
    )
    await new Promise((r) => setTimeout(r, 30))

    // Reach the real native <select> via a real Tab keypress sequence —
    // no pointer interaction.
    const select = screen.getByDisplayValue(finInWork.status) as HTMLSelectElement
    let guard = 0
    while (document.activeElement !== select && guard < 10) {
      await user.tab()
      guard += 1
    }
    expect(document.activeElement).toBe(select)

    // Drive the resulting selection change. selectOptions is a reliable
    // proxy for the DOM/state contract a keyboard-driven selection would
    // produce; it is not itself a raw ArrowDown/Enter key sequence — see
    // file header.
    await user.selectOptions(select, 'בוצע')

    const updateCall = firestoreMock.writeCalls.find(
      (w) => w.kind === 'updateDoc' && w.path === `tasks/${TASKS.fin.id}`
    )
    expect(updateCall).toBeTruthy()
    expect((updateCall!.data as Record<string, unknown>).status).toBe('בוצע')
    expect(document.activeElement).toBe(select)
  })
})
