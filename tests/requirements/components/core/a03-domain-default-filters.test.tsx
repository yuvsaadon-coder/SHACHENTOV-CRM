// TEST-A03 — domain-default filter behavior on domain-bearing lists.
// Requirements: T04a / E03. Layer V. Family classification: G — code predicts
// a behavioral gap (see TEST-PLAN.md P06/P12/P19).
// Real App, real hooks, real pages. Firebase SDK boundary mocked.
//
// Per TEST-PLAN.md §6.A row A03 the flow is:
//   GIVEN FIN and VOL tasks/contacts/knowledge;
//   WHEN hq-fin opens each domain-bearing list first with no URL state and
//        then an unrelated view=kanban URL;
//   THEN own-domain default is present where required, admin starts with
//        all, user-selected filters survive detail/back.
//   Do NOT assert cross-domain denial.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

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
import App from '../../../../src/App'

const HQ_FIN = { uid: IDENTITIES.hqFin.uid, email: IDENTITIES.hqFin.email }
const ADMIN = { uid: IDENTITIES.adminA.uid, email: IDENTITIES.adminA.email }

function primeHqFinSignedIn() {
  firestoreMock.setDocValue(`users/${HQ_FIN.uid}`, {
    name: IDENTITIES.hqFin.name,
    email: IDENTITIES.hqFin.email,
    role: IDENTITIES.hqFin.role, // 'FIN'
    active: true,
  })
  authMock.currentUser = HQ_FIN
}

function primeAdminSignedIn() {
  firestoreMock.setDocValue(`users/${ADMIN.uid}`, {
    name: IDENTITIES.adminA.name,
    email: IDENTITIES.adminA.email,
    role: 'admin',
    active: true,
  })
  authMock.currentUser = ADMIN
}

async function waitForListener(path: string, timeoutMs = 2000) {
  const start = Date.now()
  while (firestoreMock.liveCount(path) === 0) {
    if (Date.now() - start > timeoutMs) return false
    await new Promise((r) => setTimeout(r, 5))
  }
  return true
}

describe('TEST-A03 — domain-default filters (V, family=G)', () => {
  beforeEach(() => {
    firestoreMock.reset()
    authMock.reset()
    window.history.replaceState({}, '', '/')
  })

  it('TEST-A03.tasks.own-domain-default (A) — hq-fin at /tasks with no URL state gets domain=FIN applied automatically', async () => {
    primeHqFinSignedIn()
    window.history.pushState({}, '', '/tasks')

    render(<App />)

    // TasksPage.tsx:118-128 sets domain=FIN in the URL as a replace on first
    // entry when the user has a domain role and there are no URL params.
    await waitFor(() => {
      expect(window.location.search).toContain('domain=FIN')
    })
    expect(window.location.pathname).toBe('/tasks')

    // Feed tasks so the list actually renders past the loading spinner.
    await waitForListener('tasks')
    firestoreMock.emitQuery('tasks', [
      docSnap(TASKS.fin),   // FIN
      docSnap(TASKS.done),  // VOL
    ])
    await screen.findByRole('heading', { name: 'משימות' })
  })

  it('TEST-A03.tasks.own-domain-default-with-unrelated-query (G) — hq-fin at /tasks?view=kanban STILL should default to FIN per E03', async () => {
    // NOTE: TasksPage.tsx:118 early-returns whenever searchParams.size > 0.
    // The plan classifies A03 as G precisely because of this gap: an
    // unrelated view=kanban URL suppresses the own-domain default. This test
    // asserts the REQUIREMENT that the domain default is still applied. It
    // is expected to fail red until production respects E03 in that case.
    primeHqFinSignedIn()
    window.history.pushState({}, '', '/tasks?view=kanban')

    render(<App />)

    await waitForListener('tasks')
    firestoreMock.emitQuery('tasks', [docSnap(TASKS.fin), docSnap(TASKS.done)])

    // Give the page a chance to render and to run its first-entry effect.
    await screen.findByRole('heading', { name: 'משימות' })
    // Wait a beat so any URL sync from the effect can commit.
    await new Promise((r) => setTimeout(r, 50))

    // Requirement (E03 own-domain default view): the URL must include
    // domain=FIN. Production gap: it will not, because searchParams.size > 0.
    expect(window.location.search).toContain('domain=FIN')
  })

  it('TEST-A03.tasks.admin-starts-with-all (A) — admin at /tasks with no URL state is NOT auto-scoped to a domain', async () => {
    primeAdminSignedIn()
    window.history.pushState({}, '', '/tasks')

    render(<App />)

    await waitForListener('tasks')
    firestoreMock.emitQuery('tasks', [docSnap(TASKS.fin), docSnap(TASKS.done)])
    await screen.findByRole('heading', { name: 'משימות' })
    // Let the first-entry effect run.
    await new Promise((r) => setTimeout(r, 50))

    // admin is not a member of DOMAINS, so TasksPage must NOT set domain=*
    // (TasksPage.tsx:119-128 gates the auto-set on isDomainRole).
    expect(window.location.search).not.toContain('domain=')
    // The list header renders (we do not assert content — the built-in month
    // filter interacts with real system time and is not the claim under test).
    expect(screen.getByRole('heading', { name: 'משימות' })).toBeInTheDocument()
  })

  it('TEST-A03.tasks.filters-survive-navigation (A) — a user-selected status filter is preserved across a detail → back round-trip', async () => {
    primeAdminSignedIn()
    // User arrived at /tasks and manually applied a status filter.
    window.history.pushState({}, '', '/tasks?status=%D7%91%D7%A2%D7%91%D7%95%D7%93%D7%94')

    render(<App />)

    await waitForListener('tasks')
    firestoreMock.emitQuery('tasks', [docSnap(TASKS.fin)])
    await screen.findByRole('heading', { name: 'משימות' })
    const beforeSearch = window.location.search
    expect(beforeSearch).toContain('status=')

    // Navigate to task detail (simulate a click that pushes /tasks/<id>).
    window.history.pushState({}, '', `/tasks/${TASKS.fin.id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe(`/tasks/${TASKS.fin.id}`))

    // Browser-back: filter query string on /tasks must be preserved.
    window.history.back()
    await waitFor(() => expect(window.location.pathname).toBe('/tasks'))
    expect(window.location.search).toBe(beforeSearch)
  })

  it('TEST-A03.contacts.own-domain-default (G) — hq-fin at /contacts must default to only FIN-tagged contacts, not every domain', async () => {
    // Per TEST-PLAN.md P12: ContactsPage.tsx:254-291 has category/type/text
    // filters and NO domain-based filter at all — `domainTags` is read only
    // by the add/edit form, never by the list's `filtered` memo. Retraction
    // note: an earlier version of this test used EMPTY contacts data and
    // only checked an unfiltered URL/heading — that passed vacuously
    // regardless of whether own-domain filtering existed. This version
    // seeds real FIN- and VOL-tagged contacts and asserts the actual
    // membership requirement directly.
    primeHqFinSignedIn()
    window.history.pushState({}, '', '/contacts')

    render(<App />)

    await waitForListener('contacts')
    firestoreMock.emitQuery('contacts', [
      { id: 'contact-fin', data: { name: 'ספק כספים בדיקה', type: 'ספק', phone: '', email: '', notes: '', domainTags: ['FIN'], category: '' } },
      { id: 'contact-vol', data: { name: 'ספק מתנדבים בדיקה', type: 'ספק', phone: '', email: '', notes: '', domainTags: ['VOL'], category: '' } },
    ])
    await waitForListener('tasks')
    firestoreMock.emitQuery('tasks', [])

    await screen.findByRole('heading', { name: 'אנשי קשר' })

    // Requirement (E03 own-domain default membership): only the FIN-tagged
    // contact is visible by default; the VOL-tagged one must not be.
    expect(screen.getByText('ספק כספים בדיקה')).toBeInTheDocument()
    expect(screen.queryByText('ספק מתנדבים בדיקה')).not.toBeInTheDocument()
  })

})
