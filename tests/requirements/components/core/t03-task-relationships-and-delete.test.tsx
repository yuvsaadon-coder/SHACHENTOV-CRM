/**
 * TEST-T03 — task relationships, subtask creation, and delete / dependency-editor gaps.
 *
 * Requirements: T10a / E04. Layer V. Family classification: A/G.
 *
 * Subcases (see TEST-PLAN.md §6 T03 row):
 *   - TEST-T03.parent-child-navigation  (A) — real detail page for a task with
 *     two children renders both children as navigable links.
 *   - TEST-T03.subtask-creation-persists (A) — the visible "+ הוסף תת-משימה"
 *     control writes a new task doc via setDoc with parentTaskId = current.
 *   - TEST-T03.delete-control-persists (G) — requirement: a delete control
 *     must exist and must persist a deleteDoc; TaskDetailPage exposes none,
 *     so this asserts the required capability directly and reports the
 *     actual (red) result.
 *   - TEST-T03.no-dependency-editor      (G) — TaskDetailPage's edit form
 *     exposes NO dependency (dependsOn) or contactRefs editor; the requirement
 *     "editing relationships through real task UI" is violated because those
 *     relationships cannot be edited by a user.
 *
 * NOT-EXECUTED here (out of V-scope):
 *   - Persistence + cascade / cycle-block semantics beyond referential integrity
 *     (§T03 "U" — pushed to emulator/core L05-style lane).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

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
import { IDENTITIES, TASKS, docSnap } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { ToastProvider } from '../../../../src/context/ToastContext'
import { TaskDetailPage } from '../../../../src/pages/TaskDetailPage'

function authenticateAdmin() {
  firestoreMock.setDocValue(`users/${IDENTITIES.adminA.uid}`, {
    name: IDENTITIES.adminA.name,
    email: IDENTITIES.adminA.email,
    role: IDENTITIES.adminA.role,
    active: true,
  })
  authMock.currentUser = { uid: IDENTITIES.adminA.uid, email: IDENTITIES.adminA.email }
}

function renderDetail(initialPath: string) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

async function waitForAuthReady() {
  await new Promise((r) => setTimeout(r, 30))
}

// Two children pointing to task-fin. Matches the real subtask read path
// (TaskDetailPage.tsx:74-86 queries collection 'tasks' where parentTaskId==id).
const child1 = { ...TASKS.fin, id: 'task-fin-child-1', title: 'תת-משימה 1', parentTaskId: TASKS.fin.id, status: 'לא בוצע' as const }
const child2 = { ...TASKS.fin, id: 'task-fin-child-2', title: 'תת-משימה 2', parentTaskId: TASKS.fin.id, status: 'לא בוצע' as const }

/** Prime the main-doc getDoc BEFORE render() so the initial useEffect resolves it. */
function primeTaskFinDoc() {
  firestoreMock.setDocValue(`tasks/${TASKS.fin.id}`, TASKS.fin as unknown as Record<string, unknown>)
}

/** After render, drain the sub-collection listeners. */
async function emitTaskFinSubs(subTasks: unknown[] = [child1, child2].map(docSnap)) {
  await new Promise((r) => setTimeout(r, 20))
  await act(async () => {
    firestoreMock.emitQuery('tasks', subTasks as { id: string; data: Record<string, unknown> }[])
    firestoreMock.emitQuery(`tasks/${TASKS.fin.id}/comments`, [])
    firestoreMock.emitQuery(`tasks/${TASKS.fin.id}/attachments`, [])
    firestoreMock.emitQuery(`tasks/${TASKS.fin.id}/history`, [])
    await new Promise((r) => setTimeout(r, 20))
  })
}

describe('TEST-T03 — task relationships & delete/dependency gaps (V, family=A/G)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    authenticateAdmin()
  })

  it('TEST-T03.parent-child-navigation (A) — both children of task-fin appear as navigable links in the sub-tasks section', async () => {
    primeTaskFinDoc()
    renderDetail(`/tasks/${TASKS.fin.id}`)
    await waitForAuthReady()
    await emitTaskFinSubs()

    // Wait for the primary task title to render (getDoc resolved).
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /משימת בדיקה כספים/ })).toBeInTheDocument())

    // Both children must appear as links inside the sub-tasks list.
    const child1Link = await screen.findByRole('link', { name: 'תת-משימה 1' })
    const child2Link = await screen.findByRole('link', { name: 'תת-משימה 2' })
    expect(child1Link).toHaveAttribute('href', `/tasks/${child1.id}`)
    expect(child2Link).toHaveAttribute('href', `/tasks/${child2.id}`)

    // Counter reflects the two children.
    expect(screen.getByRole('heading', { level: 2, name: /תתי-משימות \(2\)/ })).toBeInTheDocument()
  })

  it('TEST-T03.subtask-creation-persists (A) — the visible "+ הוסף תת-משימה" control writes a new task doc with parentTaskId = current', async () => {
    const user = userEvent.setup()
    primeTaskFinDoc()
    renderDetail(`/tasks/${TASKS.fin.id}`)
    await waitForAuthReady()
    await emitTaskFinSubs([]) // zero existing children so we assert the creation write cleanly

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /משימת בדיקה כספים/ })).toBeInTheDocument())

    // Real user opens the new-sub form.
    await user.click(screen.getByRole('button', { name: /\+ הוסף תת-משימה/ }))
    const subTitle = screen.getByPlaceholderText(/כותרת תת-משימה/) as HTMLInputElement
    await user.type(subTitle, 'תת-משימה חדשה')

    // Save.
    const saveButtons = screen.getAllByRole('button', { name: 'שמור' })
    // The sub-task save is the visible one; the details form's save is not
    // shown here because editing was never entered. Take the last (only) one.
    await user.click(saveButtons[saveButtons.length - 1])

    await waitFor(() => {
      const setDocCalls = firestoreMock.writeCalls.filter((w) => w.kind === 'setDoc')
      expect(setDocCalls.length).toBeGreaterThan(0)
    })
    const call = firestoreMock.writeCalls.find((w) => w.kind === 'setDoc')!
    expect(call.path).toMatch(/^tasks\/TASK-/)
    const payload = call.data as Record<string, unknown>
    expect(payload.title).toBe('תת-משימה חדשה')
    expect(payload.parentTaskId).toBe(TASKS.fin.id)
    expect(payload.domain).toBe(TASKS.fin.domain)
  })

  it('TEST-T03.delete-control-persists (G) — a real delete control on TaskDetailPage removes the task via deleteDoc', async () => {
    primeTaskFinDoc()
    renderDetail(`/tasks/${TASKS.fin.id}`)
    await waitForAuthReady()
    await emitTaskFinSubs()

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /משימת בדיקה כספים/ })).toBeInTheDocument())

    // Requirement: CRUD and relationship management includes deletion.
    // Find and click a delete control in view mode, then in edit mode.
    const user = userEvent.setup()
    const deleteButton =
      screen.queryByRole('button', { name: /^מחיקה$|^מחק$|^מחק משימה$|delete/i }) ??
      (await (async () => {
        await user.click(screen.getByRole('button', { name: 'עריכה' }))
        return screen.queryByRole('button', { name: /^מחיקה$|^מחק$|^מחק משימה$|delete/i })
      })())

    expect(deleteButton).not.toBeNull()
    await user.click(deleteButton!)

    await waitFor(() => {
      const deleteCall = firestoreMock.writeCalls.find(
        (w) => w.kind === 'deleteDoc' && w.path === `tasks/${TASKS.fin.id}`
      )
      expect(deleteCall).toBeTruthy()
    })
  })

  it('TEST-T03.no-dependency-editor (G) — the edit form exposes no dependency (dependsOn) or contactRefs editor UI', async () => {
    primeTaskFinDoc()
    renderDetail(`/tasks/${TASKS.fin.id}`)
    await waitForAuthReady()
    await emitTaskFinSubs()

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /משימת בדיקה כספים/ })).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'עריכה' }))

    // Enumerate every label the edit form actually renders. The plan-cited
    // gap: neither "תלות" (dependency) nor "אנשי קשר מקושרים" (linked
    // contacts) / "contactRefs" appears — the exposed relationship editor
    // is limited to the free-text "מעורבים" chip input.
    const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent?.trim() ?? '')
    // Firm requirement: an editor for dependsOn/contactRefs must be present.
    // Both of the following non-inverted checks are expected to fail red on
    // baseline — that is the reported gap.
    const hasDependencyEditor = labels.some((t) => /תלות|תלוי ב|dependsOn|תלויות/.test(t))
    const hasContactEditor = labels.some((t) => /אנשי קשר|contactRefs|קשרי אנשי קשר/.test(t))

    // Sanity: the "involved" chip editor IS present — this confirms we
    // successfully opened the edit form, so a red on either of the two below
    // reflects a real absence, not a broken harness.
    expect(labels.some((t) => /מעורבים/.test(t))).toBe(true)

    expect(hasDependencyEditor).toBe(true)
    expect(hasContactEditor).toBe(true)
  })
})
