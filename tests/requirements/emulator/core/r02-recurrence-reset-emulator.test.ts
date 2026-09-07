// TEST-R02 real-emulator confirmation variant (+R lane).
//
// Mounts the REAL `useRecurringTaskReset` hook (src/hooks/useRecurringTaskReset.ts)
// against a real Firestore Emulator client SDK — via
// tests/requirements/support/emulator-firebase-alias.ts, which only
// substitutes this test's own resolution of `src/lib/firebase` — and
// reads back the actually-persisted documents. No manual write proxy.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from '../../support/emulator-env'
import { createEmulatorFirebaseAlias } from '../../support/emulator-firebase-alias'

const RUN_ID = `r02-${Date.now()}-${Math.random().toString(36).slice(2)}`
const id = (name: string) => `${RUN_ID}-${name}`

let env: RulesTestEnvironment
const alias = createEmulatorFirebaseAlias(`r02-alias-${RUN_ID}`)

vi.mock('../../../../src/lib/firebase', () => ({
  auth: alias.auth,
  db: alias.db,
  storage: alias.storage,
}))

// Real production hook is imported dynamically inside each test (not as a
// static top-level import): ES `import` declarations are hoisted and
// evaluate before any top-level `const`, so a static import here would
// resolve the mocked `src/lib/firebase` before `alias` is initialized
// (`ReferenceError: Cannot access 'alias' before initialization`).
import type { Task } from '../../../../src/types'

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

beforeEach(async () => {
  await env.clearFirestore()
  // The hook's real batch write/reads require an HQ-authorized real Auth
  // Emulator identity per the unchanged firestore.rules isHQ() condition.
  const cred = await signInAnonymously(alias.auth)
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), {
      name: 'מנהל בדיקה', email: `${cred.user.uid}@requirements.invalid`, role: 'admin', active: true,
    })
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-06T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

function seededTask(overrides: Partial<Task> & Pick<Task, 'id' | 'frequency' | 'status'>): Task {
  return {
    domain: 'FIN',
    title: overrides.id,
    ...overrides,
  } as Task
}

describe('TEST-R02 (+R) emulator confirmation', () => {
  it('TEST-R02.emulator.stale-recurring-task-persists-reset', async () => {
    const stalePath = `tasks/${id('stale')}`
    const freshPath = `tasks/${id('fresh')}`
    const oneOffPath = `tasks/${id('one-off')}`

    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore()
      await Promise.all([
        setDoc(doc(fs, stalePath), { title: 'stale-monthly', domain: 'FIN', frequency: 'חודשי', status: 'בעבודה', cycleKey: '2026-08' }),
        setDoc(doc(fs, freshPath), { title: 'fresh-monthly', domain: 'FIN', frequency: 'חודשי', status: 'בעבודה', cycleKey: '2026-09' }),
        setDoc(doc(fs, oneOffPath), { title: 'one-off', domain: 'FIN', frequency: 'חד-פעמי', status: 'בעבודה' }),
      ])
    })

    const tasks: Task[] = [
      seededTask({ id: id('stale'), frequency: 'חודשי', status: 'בעבודה', cycleKey: '2026-08' } as Task),
      seededTask({ id: id('fresh'), frequency: 'חודשי', status: 'בעבודה', cycleKey: '2026-09' } as Task),
      seededTask({ id: id('one-off'), frequency: 'חד-פעמי', status: 'בעבודה' } as Task),
    ]

    // Mount the real hook against the real emulator-bound db.
    const { useRecurringTaskReset } = await import('../../../../src/hooks/useRecurringTaskReset')
    renderHook(() => useRecurringTaskReset(tasks, true))

    // Requirement: the stale task's reset is actually persisted server-side.
    await waitFor(async () => {
      const snap = await getDoc(doc(alias.db, stalePath))
      const data = snap.data() as Record<string, unknown>
      expect(data.status).toBe('לא בוצע')
      expect(data.cycleKey).toBe('2026-09')
    })

    const freshSnap = await getDoc(doc(alias.db, freshPath))
    expect((freshSnap.data() as Record<string, unknown>).cycleKey).toBe('2026-09')
    const oneOffSnap = await getDoc(doc(alias.db, oneOffPath))
    expect((oneOffSnap.data() as Record<string, unknown>).status).toBe('בעבודה')
  })

  it('TEST-R02.emulator.same-cycle-rerender-no-duplicate-write', async () => {
    const stalePath = `tasks/${id('stale2')}`
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), stalePath), {
        title: 'stale-monthly-2', domain: 'FIN', frequency: 'חודשי', status: 'בעבודה', cycleKey: '2026-08',
      })
    })

    const staleTask = seededTask({ id: id('stale2'), frequency: 'חודשי', status: 'בעבודה', cycleKey: '2026-08' } as Task)
    const { useRecurringTaskReset } = await import('../../../../src/hooks/useRecurringTaskReset')
    const { rerender } = renderHook(
      ({ tasks }: { tasks: Task[] }) => useRecurringTaskReset(tasks, true),
      { initialProps: { tasks: [staleTask] } },
    )

    await waitFor(async () => {
      const snap = await getDoc(doc(alias.db, stalePath))
      expect((snap.data() as Record<string, unknown>).cycleKey).toBe('2026-09')
    })
    const afterFirstReset = await getDoc(doc(alias.db, stalePath))
    const firstUpdatedAt = (afterFirstReset.data() as Record<string, unknown>).updatedAt

    // Listener echoes the just-written (now-fresh) document back — must
    // not trigger a second write.
    const echoedFresh = seededTask({ id: id('stale2'), frequency: 'חודשי', status: 'לא בוצע', cycleKey: '2026-09' } as Task)
    rerender({ tasks: [echoedFresh] })
    await new Promise((r) => setTimeout(r, 300))

    const afterRerender = await getDoc(doc(alias.db, stalePath))
    expect((afterRerender.data() as Record<string, unknown>).updatedAt).toEqual(firstUpdatedAt)
  })
})
