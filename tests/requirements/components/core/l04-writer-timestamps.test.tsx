// TEST-L04 — writer timestamps (server vs client vs omitted).
// Requirements: T05c. Layer V. Family classification: G (code predicts
// gaps — TEST-PLAN.md §6 row L04).
//
// Per TEST-PLAN.md the flow is:
//   GIVEN create then edit through real task/contact/role/branch/question/
//         HQ/local/research/private/history writers;
//   WHEN inspecting committed records;
//   THEN creation/update times are server-assigned for applicable
//        operations and not client-clock strings; errors cannot claim
//        persistence prematurely.
//
// This V-layer file inspects what the REAL production writer passed to
// the Firestore SDK boundary (recorded on firestoreMock.writeCalls). Our
// mock represents serverTimestamp() as {__type:'serverTimestamp'} — any
// other value in a createdAt/updatedAt field is the writer's own output.
//
// Named writer cases (one it per writer) so a single failure doesn't
// mask another writer's independent evidence. Each asserts the REQUIRED
// server-assigned timestamp and reports the actual result:
//   - useContacts.addContact/updateContact — compliant (serverTimestamp)
//   - useReportQuestionAdmin.create/update — required serverTimestamp;
//     src\hooks\useReportQuestions.ts:65-73 omits it entirely
//   - RoleEditModal save — required serverTimestamp;
//     src\components\roles\RoleEditModal.tsx:51-71 omits it entirely
//   - useAddHQKnowledge → syncToCoordinators mirror — required
//     serverTimestamp; src\hooks\useHQKnowledge.ts:9-17 uses an ISO string
//
// Deferred to R (emulator) lane:
//   - Task writer (TaskDetailPage) — requires full router + useParams
//     setup that reimplements page mounting logic; the plan explicitly
//     permits deferring writers too deeply nested to reach without
//     disproportionate setup. Covered by the emulator L04 file.
//   - Branch writer (BranchesPage) — same rationale.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

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

// Stub Firebase Storage — useAddHQKnowledge imports uploadBytes etc.
// We never exercise a file upload in these tests (no file passed to
// addItem), so bare no-op fakes are enough to prevent boundary errors.
vi.mock('firebase/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/storage')>()
  return {
    ...actual,
    ref: vi.fn(() => ({})),
    uploadBytes: vi.fn(async () => ({})),
    getDownloadURL: vi.fn(async () => 'https://example.invalid/file'),
  }
})

import { firestoreMock } from '../../support/core-firestore-mock'
import { authMock } from '../../support/core-auth-mock'
import { useContacts } from '../../../../src/hooks/useContacts'
import { useReportQuestionAdmin } from '../../../../src/hooks/useReportQuestions'
import { useAddHQKnowledge } from '../../../../src/hooks/useHQKnowledge'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { RoleEditModal } from '../../../../src/components/roles/RoleEditModal'

beforeEach(() => {
  firestoreMock.reset()
  authMock.reset()
})

function findWriteToPath(kind: string, path: string) {
  return firestoreMock.writeCalls.find((c) => c.kind === kind && c.path === path)
}

describe('TEST-L04 writer timestamps', () => {
  it('TEST-L04.contact-writer.server-timestamp', async () => {
    // useContacts.addContact / updateContact both use serverTimestamp() —
    // the compliant baseline case. Named separately so the compliant
    // writer stays green independently of the omitted-timestamp gaps below.
    const { result } = renderHook(() => useContacts())

    await act(async () => {
      // Cast avoids re-declaring the full Contact type here.
      await result.current.addContact({ name: 'איש קשר בדיקה' } as unknown as Parameters<typeof result.current.addContact>[0])
    })
    const addCall = findWriteToPath('addDoc', 'contacts')
    expect(addCall).toBeTruthy()
    const addData = addCall!.data as Record<string, unknown>
    expect(addData.createdAt).toEqual({ __type: 'serverTimestamp' })

    await act(async () => {
      await result.current.updateContact('contact-a', { name: 'עודכן' } as unknown as Parameters<typeof result.current.updateContact>[1])
    })
    const updateCall = findWriteToPath('updateDoc', 'contacts/contact-a')
    expect(updateCall).toBeTruthy()
    const updateData = updateCall!.data as Record<string, unknown>
    expect(updateData.updatedAt).toEqual({ __type: 'serverTimestamp' })
  })

  it('TEST-L04.report-question-writer.timestamp-gap', async () => {
    // src\hooks\useReportQuestions.ts:65-73 — create/update pass the raw
    // payload straight to Firestore with NO createdAt/updatedAt at all.
    // ReportQuestionsAdminPage.save() (src\pages\admin\ReportQuestionsAdminPage.tsx:142-158)
    // also does not add timestamps to `payload`. Confirmed G.
    const { result } = renderHook(() => useReportQuestionAdmin())

    await act(async () => {
      await result.current.create({
        branchType: 'food',
        key: 'k-new',
        label: 'שאלה חדשה',
        section: 'כללי',
        type: 'text',
        firstReportOnly: false,
        order: 1,
      } as unknown as Parameters<typeof result.current.create>[0])
    })
    const addCall = findWriteToPath('addDoc', 'reportQuestions')
    expect(addCall).toBeTruthy()
    const addData = addCall!.data as Record<string, unknown>
    // Requirement: creation time is server-assigned.
    expect(addData.createdAt).toEqual({ __type: 'serverTimestamp' })

    await act(async () => {
      await result.current.update('q-1', { label: 'עודכן' } as unknown as Parameters<typeof result.current.update>[1])
    })
    const updateCall = findWriteToPath('updateDoc', 'reportQuestions/q-1')
    expect(updateCall).toBeTruthy()
    const updateData = updateCall!.data as Record<string, unknown>
    // Requirement: update time is server-assigned.
    expect(updateData.updatedAt).toEqual({ __type: 'serverTimestamp' })
  })

  it('TEST-L04.role-writer.timestamp-gap', async () => {
    // src\components\roles\RoleEditModal.tsx:51-71 — save() builds `data`
    // from form fields only, then calls addDoc/updateDoc with NO
    // createdAt/updatedAt. Drive the real component via userEvent.
    const onClose = vi.fn()
    const { container } = render(
      React.createElement(RoleEditModal, { role: null, allRoles: [], onClose })
    )

    // Labels in this modal aren't linked to inputs via htmlFor, so we grab
    // the first text input directly — the roleName field is first in DOM order.
    const nameInput = container.querySelector('input[type=""], input:not([type])') as HTMLInputElement
      ?? (container.querySelector('input') as HTMLInputElement)
    fireEvent.change(nameInput, { target: { value: 'תפקיד בדיקה' } })

    const saveButton = screen.getByRole('button', { name: /^שמור/ })
    await act(async () => {
      fireEvent.click(saveButton)
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    const addCall = findWriteToPath('addDoc', 'roles')
    expect(addCall).toBeTruthy()
    const addData = addCall!.data as Record<string, unknown>
    // Requirement: creation time is server-assigned.
    expect(addData.createdAt).toEqual({ __type: 'serverTimestamp' })
    // Confirm the writer DID persist real form data — the omission is not
    // from an empty submit.
    expect(addData.roleName).toBe('תפקיד בדיקה')
  })

  it('TEST-L04.role-writer.update-timestamp-gap', async () => {
    // Same modal, but editing an existing role — update path also
    // omits updatedAt (RoleEditModal.tsx:66).
    const onClose = vi.fn()
    const existingRole = {
      id: 'role-existing',
      roleName: 'תפקיד קיים',
      level: 'מטה' as const,
      area: '',
      holderName: '',
      status: 'חסר' as const,
      priority: 'רגיל' as const,
      email: '',
      phone: '',
      linkedTaskIds: [],
      affectsTasks: false,
      delegatedTo: null,
      notes: '',
    }
    render(
      React.createElement(RoleEditModal, { role: existingRole, allRoles: [existingRole], onClose })
    )

    const nameInput = document.querySelector('input') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'תפקיד קיים - שונה' } })
    const saveButton = screen.getByRole('button', { name: /^שמור/ })
    await act(async () => {
      fireEvent.click(saveButton)
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    const updateCall = findWriteToPath('updateDoc', 'roles/role-existing')
    expect(updateCall).toBeTruthy()
    const updateData = updateCall!.data as Record<string, unknown>
    // Requirement: update time is server-assigned.
    expect(updateData.updatedAt).toEqual({ __type: 'serverTimestamp' })
    expect(updateData.roleName).toBe('תפקיד קיים - שונה')
  })

  it('TEST-L04.hq-knowledge-writer.mirror-requires-server-timestamp', async () => {
    // useAddHQKnowledge with visibleToCoordinators:true triggers
    // syncToCoordinators (src\hooks\useHQKnowledge.ts:9-17), which
    // writes createdAt: new Date().toISOString() — a client-clock STRING,
    // not a serverTimestamp. The primary hq_knowledge document DOES use
    // serverTimestamp (compliant), so we assert both facets: primary
    // is server-assigned; mirror is a client ISO string (the G defect).
    //
    // useAddHQKnowledge depends on useAuth(); wrap in AuthProvider so
    // appUser resolves via the mocked auth boundary.
    firestoreMock.setDocValue('users/hq-fin', {
      name: 'רכז בדיקה', email: 'hq-fin@example.test', role: 'FIN', active: true,
    })
    authMock.currentUser = { uid: 'hq-fin', email: 'hq-fin@example.test' }

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)
    const { result } = renderHook(() => useAddHQKnowledge(), { wrapper })

    // Let AuthProvider resolve.
    await waitFor(() => {
      // No public probe on the hook itself; small delay via microtask.
      expect(authMock.currentUser?.uid).toBe('hq-fin')
    })
    await new Promise((r) => setTimeout(r, 20))

    await act(async () => {
      await result.current.addItem({
        domain: 'FIN',
        category: 'תקציב' as unknown as Parameters<typeof result.current.addItem>[0]['category'],
        title: 'ידע בדיקה',
        content: 'תוכן',
        tags: [],
        visibleToCoordinators: true,
      })
    })

    // Primary addDoc to hq_knowledge — createdAt/updatedAt should be
    // server-assigned. This is the compliant part of the same writer.
    const primary = firestoreMock.writeCalls.find(
      (c) => c.kind === 'addDoc' && c.path === 'hq_knowledge'
    )
    expect(primary).toBeTruthy()
    const primaryData = primary!.data as Record<string, unknown>
    expect(primaryData.createdAt).toEqual({ __type: 'serverTimestamp' })
    expect(primaryData.updatedAt).toEqual({ __type: 'serverTimestamp' })

    // Mirror setDoc to knowledgeItems/hq-<id> — requirement: creation
    // time must be server-assigned, same as any other writer.
    const mirror = firestoreMock.writeCalls.find(
      (c) => c.kind === 'setDoc' && c.path.startsWith('knowledgeItems/hq-')
    )
    expect(mirror).toBeTruthy()
    const mirrorData = mirror!.data as Record<string, unknown>
    expect(mirrorData.createdAt).toEqual({ __type: 'serverTimestamp' })
  })
})
