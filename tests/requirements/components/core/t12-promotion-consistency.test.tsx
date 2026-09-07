// TEST-T12 — Explicit personal-to-organizational promotion + partial retry.
// Requirements: T05c / E12. Layer V.
// Classifications:
//   - TEST-T12.explicit-promotion       (C) — characterize which fields the
//     real promotion flow copies into the new org task; assert exactly two
//     independent writes (addDoc org tasks + updateDoc personal task).
//   - TEST-T12.partial-promotion-retry  (G) — reject the personal-side
//     completion updateDoc; retry the promotion action; assert NO duplicate
//     org-side addDoc results (requirement: retry must not double-create).
//
// See TEST-PLAN.md §6.T row T12 and §6.1's T12 split entry.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

import { firestoreMock, makeTimestamp as ts } from '../../support/core-firestore-mock'
import { authMock } from '../../support/core-auth-mock'
import { IDENTITIES } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { ToastProvider } from '../../../../src/context/ToastContext'
import { PersonalTasksPage } from '../../../../src/pages/PersonalTasksPage'

const HQ = { uid: IDENTITIES.hqFin.uid, email: IDENTITIES.hqFin.email }
const HQ_PROFILE = {
  name: IDENTITIES.hqFin.name,
  email: IDENTITIES.hqFin.email,
  role: 'admin',
  active: true,
}
const PERSONAL_PATH = `users/${HQ.uid}/personalTasks`

function mount() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter>
          <PersonalTasksPage />
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>,
  )
}

async function primeAndSeed(personalDocs: { id: string; data: Record<string, unknown> }[]) {
  firestoreMock.setDocValue(`users/${HQ.uid}`, HQ_PROFILE)
  authMock.currentUser = HQ

  mount()
  await waitFor(() => expect(firestoreMock.liveCount(PERSONAL_PATH)).toBeGreaterThan(0))
  firestoreMock.emitQuery(PERSONAL_PATH, personalDocs)
}

const PERSONAL_TASK_ID = 'promote-me'
const PERSONAL_TASK_DATA = {
  title: 'promote to org',
  notes: 'these are my notes',
  done: false,
  status: 'לא בוצע',
  recurring: false,
  dueDate: null,
  createdAt: ts(new Date('2026-08-01')),
  updatedAt: ts(new Date('2026-08-01')),
}

beforeEach(() => {
  firestoreMock.reset()
  authMock.reset()
})

// PersonalTasksPage invokes promote() via `void promote()` (source:
// PersonalTasksPage.tsx:262 `onClick={() => void promote()}`). Its
// try/finally has NO catch, so a rejected write bubbles up as an unhandled
// promise rejection. That is exactly the concrete P11/T12 gap we surface —
// we swallow it here at the test-runner boundary so vitest doesn't treat it
// as a false-positive suite failure while still observing (and asserting)
// the same divergence via firestoreMock.writeCalls.
const swallowUnhandled = (reason: unknown) => {
  const msg = (reason as { message?: string })?.message ?? String(reason)
  if (msg.includes('personal-side rejected')) return
  // any other reason: re-throw so real bugs still surface
  throw reason
}
if (typeof process !== 'undefined') process.on('unhandledRejection', swallowUnhandled)

async function openPromoteModalAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  // The 📋 promote button is inside the row; there is only one row so only
  // one such button.
  const row = screen.getByText(PERSONAL_TASK_DATA.title).closest('div.flex.items-center')!
  const promoteBtn = Array.from(row.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === '📋',
  )!
  await user.click(promoteBtn)
  await screen.findByText('העבר למשימה ארגונית')
  // Modal defaults: domain=CEO, category='', frequency=חד-פעמי.
  // Submit as-is (assert the current defaults are copied).
  await user.click(screen.getByRole('button', { name: /^העבר$/ }))
}

describe('TEST-T12 — explicit promotion & partial retry (V)', () => {
  it('TEST-T12.explicit-promotion (C) — promotion invokes exactly two independent writes and characterizes the fields copied into the new org task', async () => {
    await primeAndSeed([{ id: PERSONAL_TASK_ID, data: PERSONAL_TASK_DATA }])
    await screen.findByText(PERSONAL_TASK_DATA.title)

    const user = userEvent.setup()
    firestoreMock.writeCalls.length = 0
    await openPromoteModalAndSubmit(user)

    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'addDoc' && w.path === 'tasks',
      )).toBe(true)
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'updateDoc' && w.path === `${PERSONAL_PATH}/${PERSONAL_TASK_ID}`,
      )).toBe(true)
    })

    // (C) — characterize the two-write shape.
    const orgAdd = firestoreMock.writeCalls.find(
      (w) => w.kind === 'addDoc' && w.path === 'tasks',
    )!
    const personalUpd = firestoreMock.writeCalls.find(
      (w) => w.kind === 'updateDoc' && w.path === `${PERSONAL_PATH}/${PERSONAL_TASK_ID}`,
    )!

    // The org-side addDoc copies exactly the fields PersonalTasksPage.tsx:29-51
    // sets. Characterize the actual field values (this is a `C` — we assert
    // what the code currently does, not what is "right").
    const orgData = orgAdd.data as Record<string, unknown>
    expect(orgData.title).toBe(PERSONAL_TASK_DATA.title)
    // notes → org task's `steps` field (not `notes`)
    expect(orgData.steps).toBe(PERSONAL_TASK_DATA.notes)
    // notes field on org side is empty string (source: PersonalTasksPage.tsx:44)
    expect(orgData.notes).toBe('')
    // Defaults from the modal:
    expect(orgData.domain).toBe('CEO')
    expect(orgData.category).toBe('כללי') // empty category → 'כללי' fallback
    expect(orgData.frequency).toBe('חד-פעמי')
    // No dates copied — always null on the org side.
    expect(orgData.startDate).toBeNull()
    expect(orgData.endDate).toBeNull()
    expect(orgData.holidayAnchor).toBeNull()
    expect(orgData.status).toBe('לא בוצע')
    // Actor fields: created/updated with the current uid string
    expect(orgData.createdBy).toBe(HQ.uid)
    expect(orgData.updatedBy).toBe(HQ.uid)

    // The personal-side updateDoc marks the row as done/complete.
    const personalData = personalUpd.data as Record<string, unknown>
    expect(personalData.status).toBe('בוצע')
    expect(personalData.done).toBe(true)

    // Exactly two writes.
    expect(firestoreMock.writeCalls.length).toBe(2)
  })

  it('TEST-T12.partial-promotion-retry (G) — when the personal-side completion write rejects but org creation succeeded, retrying must NOT create a duplicate org task', async () => {
    await primeAndSeed([{ id: PERSONAL_TASK_ID, data: PERSONAL_TASK_DATA }])
    await screen.findByText(PERSONAL_TASK_DATA.title)

    const user = userEvent.setup()

    // First attempt: queue personal-side updateDoc to reject; org addDoc succeeds.
    firestoreMock.queueWriteResult(
      'updateDoc',
      'reject',
      new Error('personal-side rejected'),
      `${PERSONAL_PATH}/${PERSONAL_TASK_ID}`,
    )
    firestoreMock.writeCalls.length = 0
    await openPromoteModalAndSubmit(user)

    // Both writes were attempted (org succeeded, personal rejected).
    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'addDoc' && w.path === 'tasks',
      )).toBe(true)
    })
    await waitFor(() => {
      expect(firestoreMock.writeCalls.some(
        (w) => w.kind === 'updateDoc' && w.path === `${PERSONAL_PATH}/${PERSONAL_TASK_ID}`,
      )).toBe(true)
    })
    // Snapshot org-adds count after first attempt.
    const afterFirst = firestoreMock.writeCalls.filter(
      (w) => w.kind === 'addDoc' && w.path === 'tasks',
    ).length
    expect(afterFirst).toBe(1)

    // The rejection means the modal's setSaving(false) finally-block runs and
    // the modal never closes — because promote() throws before onClose(). The
    // user sees the modal still open. But because PersonalTasksPage.tsx:54-59
    // uses try/finally without a catch, the error is UNCAUGHT (rejected
    // promise) — however the modal remains visible so the user can retry.
    // (Note: promote() is called via `void promote()` so it's unhandled.)
    //
    // Re-open by clicking cancel + reopening (defensive). Actually the modal
    // is still open since onClose was never called. Just click העבר again.
    // But state re-renders on personal-tasks snapshot; the task is still in
    // list because the personal doc never actually updated. The modal is still
    // mounted with `promotingTask={that task}`.
    await waitFor(() => {
      expect(screen.getByText('העבר למשימה ארגונית')).toBeInTheDocument()
    })

    // Retry: the org side succeeds again; queue nothing (both writes resolve).
    await user.click(screen.getByRole('button', { name: /^העבר$/ }))

    // Requirement: retrying after a partial failure must not create a
    // duplicate organizational task.
    await new Promise((r) => setTimeout(r, 30))
    const orgAdds = firestoreMock.writeCalls.filter(
      (w) => w.kind === 'addDoc' && w.path === 'tasks',
    )
    expect(orgAdds.length).toBe(1)
  })
})
