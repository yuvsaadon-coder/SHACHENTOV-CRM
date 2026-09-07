// TEST-L04 real-emulator confirmation variant (+R lane).
//
// This file drives the REAL production writers (RoleEditModal component,
// TaskDetailPage new-task save, useAddHQKnowledge hook) through real user
// interaction / real hook calls, connected to a REAL Firestore Emulator
// client SDK — never a manually-constructed payload passed straight to
// setDoc. The production `src/lib/firebase` module is replaced only at
// this test's own module-resolution boundary (via vi.mock) with a demo
// app bound to the loopback emulators
// (tests/requirements/support/emulator-firebase-alias.ts); no production
// file is edited.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from '../../support/emulator-env'
import { createEmulatorFirebaseAlias } from '../../support/emulator-firebase-alias'

const RUN_ID = `l04-${Date.now()}-${Math.random().toString(36).slice(2)}`

let env: RulesTestEnvironment
const alias = createEmulatorFirebaseAlias(`l04-alias-${RUN_ID}`)

// Replace the production firebase module for every import in this file's
// module graph (React, hooks, components) with the real emulator-bound
// SDK instances above — a real client, not a mock.
vi.mock('../../../../src/lib/firebase', () => ({
  auth: alias.auth,
  db: alias.db,
  storage: alias.storage,
}))

beforeAll(async () => {
  assertEmulatorEnvironment()
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATORS.firestore.host,
      port: EMULATORS.firestore.port,
      rules: readFileSync(join('tests', 'requirements', '.cache', 'firestore.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await env?.cleanup()
  await alias.dispose()
})

afterEach(cleanup)

async function signInRealAdmin(role = 'admin') {
  const cred = await signInAnonymously(alias.auth)
  const uid = cred.user.uid
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), {
      name: 'מנהל בדיקה',
      email: `${uid}@requirements.invalid`,
      role,
      active: true,
    })
  })
  return uid
}

beforeEach(async () => {
  await env.clearFirestore()
})

describe('TEST-L04 (+R) emulator confirmation', () => {
  it('TEST-L04.emulator.role-writer.requires-server-timestamp (G)', async () => {
    await signInRealAdmin()
    const { AuthProvider } = await import('../../../../src/context/AuthContext')
    const { RoleEditModal } = await import('../../../../src/components/roles/RoleEditModal')
    const React = await import('react')

    const onClose = vi.fn()
    render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(RoleEditModal, { role: null, allRoles: [], onClose }),
      ),
    )

    const user = userEvent.setup()
    const nameInput = document.querySelector('input') as HTMLInputElement
    await user.clear(nameInput)
    await user.type(nameInput, 'תפקיד בדיקה')
    await user.click(screen.getByRole('button', { name: /^שמור/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    // Read back the REAL persisted document from the real Firestore
    // Emulator (not a mock) — reuse the same authenticated admin client
    // that performed the write.
    const { getDocs, collection } = await import('firebase/firestore')
    const snaps = await getDocs(collection(alias.db, 'roles'))
    expect(snaps.empty).toBe(false)
    const data = snaps.docs[0].data() as Record<string, unknown>
    expect(data.roleName).toBe('תפקיד בדיקה')
    // Requirement (TEST-PLAN.md L04): creation/update times are
    // server-assigned for applicable operations, same web SDK Timestamp
    // class as the passing task-writer case — not omitted, not a
    // client-clock string.
    expect(data.createdAt).toBeInstanceOf(Timestamp)
    expect(data.updatedAt).toBeInstanceOf(Timestamp)
  })

  it('TEST-L04.emulator.task-writer.server-timestamp-becomes-Timestamp', async () => {
    await signInRealAdmin()
    const { AuthProvider } = await import('../../../../src/context/AuthContext')
    const { ToastProvider } = await import('../../../../src/context/ToastContext')
    const { TaskDetailPage } = await import('../../../../src/pages/TaskDetailPage')
    const { MemoryRouter, Routes, Route } = await import('react-router-dom')
    const React = await import('react')

    render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(
          ToastProvider,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/tasks/new'] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, { path: '/tasks/:id', element: React.createElement(TaskDetailPage) }),
            ),
          ),
        ),
      ),
    )

    const user = userEvent.setup()
    // TaskDetailPage's new-task title field has a <label> "כותרת משימה *"
    // but no placeholder — locate it as the first text input, mirroring
    // the pattern already used for RoleEditModal above.
    const titleInput = await waitFor(() => {
      const input = document.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null
      if (!input) throw new Error('title input not yet rendered')
      return input
    })
    await user.type(titleInput, 'משימת בדיקה')
    await user.click(screen.getByRole('button', { name: /^שמור/ }))

    let taskId = ''
    await waitFor(async () => {
      // `createdBy` is written as the user's display NAME (TaskDetailPage
      // ~L129: `createdBy: appUser?.name`), not the uid — match on the
      // real writer's actual field shape, not an assumed one.
      const { getDocs, collection, query, where } = await import('firebase/firestore')
      const snaps = await getDocs(query(collection(alias.db, 'tasks'), where('title', '==', 'משימת בדיקה')))
      expect(snaps.empty).toBe(false)
      taskId = snaps.docs[0].id
    })

    const snap = await getDoc(doc(alias.db, 'tasks', taskId))
    const data = snap.data() as Record<string, unknown>
    expect(data.createdAt).toBeInstanceOf(Timestamp)
    expect(data.updatedAt).toBeInstanceOf(Timestamp)
  })

  it('TEST-L04.emulator.hq-knowledge-mirror.requires-server-timestamp', async () => {
    const uid = await signInRealAdmin('admin')
    const { AuthProvider } = await import('../../../../src/context/AuthContext')
    const { useAddHQKnowledge } = await import('../../../../src/hooks/useHQKnowledge')
    const { renderHook, act: rtlAct } = await import('@testing-library/react')
    const React = await import('react')

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthProvider, null, children)
    const { result } = renderHook(() => useAddHQKnowledge(), { wrapper })

    await waitFor(() => expect(alias.auth.currentUser?.uid).toBe(uid))

    await rtlAct(async () => {
      await result.current.addItem({
        domain: 'FIN',
        category: 'other' as unknown as Parameters<typeof result.current.addItem>[0]['category'],
        title: 'ידע בדיקה',
        content: 'תוכן',
        tags: [],
        visibleToCoordinators: true,
      })
    })

    // Real production writer (useHQKnowledge.ts syncToCoordinators) ran
    // against the real emulator — inspect what it actually persisted.
    const { getDocs, collection, query, where } = await import('firebase/firestore')
    const mirrorSnaps = await getDocs(query(collection(alias.db, 'knowledgeItems'), where('title', '==', 'ידע בדיקה')))
    expect(mirrorSnaps.empty).toBe(false)
    const mirrorData = mirrorSnaps.docs[0].data() as Record<string, unknown>
    // Requirement: creation time is server-assigned, same as any writer.
    expect(mirrorData.createdAt).toBeInstanceOf(Timestamp)
  })
})
