// TEST-T08 real-emulator confirmation variant (+R lane).
//
// Drives the REAL `TaskDetailPage` attachment-upload flow through real
// user interaction, connected to a REAL Firestore + Storage Emulator
// client SDK (via tests/requirements/support/emulator-firebase-alias.ts —
// substitutes only this test's own resolution of `src/lib/firebase`; no
// production file edited). Confirms on real infrastructure what the V-lane
// mock already predicted:
//   - storage-roundtrip (G): the real Storage Emulator receives NO object
//     for the uploaded file — the writer stores a base64 data-URL in
//     Firestore instead of calling `uploadBytes`. Verified without
//     guessing any path: a Firebase Admin SDK connection
//     (`support/emulator-admin.ts`) proves bucket list/read/write genuinely
//     work via a harmless control object, reads the SUT's OWN persisted
//     `Attachment.storageUrl` to check it isn't an inline data URL, and
//     diffs a full before/after bucket listing (not a guessed prefix) to
//     look for any genuinely new object — a denied client-side LIST would
//     otherwise be indistinguishable from "no object exists".
//   - counter-recovery (G): if the second (counter) write fails after the
//     first (attachment) write already committed, the attachment record
//     is not rolled back and the count stays permanently inconsistent.
//     Firestore Security Rules apply the SAME `isHQ()` condition to both
//     writes (firestore.rules: `match /tasks/{taskId} { ... match
//     /{sub}/{subId} { ... } }`), so rules cannot desynchronize the two
//     calls — to reproduce a real second-write failure, this test wraps
//     the real `updateDoc` export in a vi.fn() passthrough (registered via
//     vi.mock so it survives ESM's frozen module namespaces) and rejects
//     only the next call via `mockImplementationOnce` — structurally the
//     only `updateDoc` call TaskDetailPage's upload flow makes is the
//     counter increment. Every other SDK call — including the attachment
//     `addDoc` itself, all reads, and rules enforcement — is the real,
//     unmocked Firestore Emulator; this is fault injection at a single
//     call site, not a fake allow/deny implementation.
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
import { doc, setDoc, getDocs, collection } from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { assertEmulatorEnvironment, EMULATORS, PROJECT_ID } from '../../support/emulator-env'
import { createEmulatorFirebaseAlias } from '../../support/emulator-firebase-alias'
import { createEmulatorAdmin } from '../../support/emulator-admin'

const RUN_ID = `t08-${Date.now()}-${Math.random().toString(36).slice(2)}`

let env: RulesTestEnvironment
const alias = createEmulatorFirebaseAlias(`t08-alias-${RUN_ID}`)
const admin = createEmulatorAdmin(`t08-admin-${RUN_ID}`)

vi.mock('../../../../src/lib/firebase', () => ({
  auth: alias.auth,
  db: alias.db,
  storage: alias.storage,
}))

// Wrap the real `updateDoc` in a vi.fn() passthrough (calls through to the
// real emulator-bound implementation by default) so the counter-recovery
// test below can reject exactly the next call via `mockImplementationOnce`
// — real ESM module namespaces are frozen, so `vi.spyOn` on an already-
// imported module's export does not work; wrapping at mock-registration
// time is the supported pattern.
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, updateDoc: vi.fn(actual.updateDoc) }
})

const { AuthProvider } = await import('../../../../src/context/AuthContext')
const { ToastProvider } = await import('../../../../src/context/ToastContext')
const { TaskDetailPage } = await import('../../../../src/pages/TaskDetailPage')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')
const React = await import('react')

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
  await admin.dispose()
})

afterEach(cleanup)

async function signInRealHQ() {
  const cred = await signInAnonymously(alias.auth)
  const uid = cred.user.uid
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), {
      name: 'רכז בדיקה', email: `${uid}@requirements.invalid`, role: 'FIN', active: true,
    })
  })
  return uid
}

async function seedTask(taskId: string, uid: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `tasks/${taskId}`), {
      domain: 'FIN', category: 'תקציב', title: 'משימת בדיקה קבצים', steps: '',
      frequency: 'חד-פעמי', startDate: null, endDate: null, holidayAnchor: null,
      involved: [], activator: null, contactRefs: [], status: 'לא בוצע', notes: '',
      createdBy: uid, updatedBy: uid,
    })
  })
}

function mountDetail(taskId: string) {
  return render(
    React.createElement(
      AuthProvider,
      null,
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: [`/tasks/${taskId}`] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: '/tasks/:id', element: React.createElement(TaskDetailPage) }),
          ),
        ),
      ),
    ),
  )
}

beforeEach(async () => {
  await env.clearFirestore()
})

describe('TEST-T08 (+R) emulator confirmation', () => {
  it('TEST-T08.emulator.storage-roundtrip (G) — the real Storage Emulator must receive the uploaded file bytes', async () => {
    const uid = await signInRealHQ()
    const taskId = `${RUN_ID}-task1`
    await seedTask(taskId, uid)

    // Setup control: prove the Admin SDK genuinely reaches the demo
    // bucket's list/read/write before drawing any conclusion from it —
    // a denied client-side LIST (storage.rules default-denies `tasks/**`)
    // would otherwise be indistinguishable from "no object exists".
    const controlName = `t08-control-${RUN_ID}.txt`
    const controlBytes = Buffer.from('control-object')
    // `resumable: false`: the resumable-upload code path in
    // `@google-cloud/storage` checks `signal instanceof AbortSignal`
    // against the REAL Node AbortSignal, but this file's jsdom test
    // environment (needed for real React rendering) replaces the global
    // `AbortSignal` with jsdom's own — a simple (non-resumable) upload
    // avoids that code path entirely; it's still a real Storage write.
    await admin.bucket.file(controlName).save(controlBytes, { contentType: 'text/plain', resumable: false })
    const [beforeFiles] = await admin.bucket.getFiles()
    expect(beforeFiles.some((f) => f.name === controlName)).toBe(true)
    const namesBefore = new Set(beforeFiles.map((f) => f.name))

    mountDetail(taskId)
    await screen.findByText('משימת בדיקה קבצים')
    await userEvent.setup().click(screen.getByRole('button', { name: /קבצים/ }))

    const uploadedBytes = new Uint8Array([1, 2, 3, 4, 42, 7])
    const file = new File([uploadedBytes], 'harmless.bin', { type: 'application/octet-stream' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.setup().upload(input, file)

    let attachmentData: Record<string, unknown> | undefined
    await waitFor(async () => {
      const snap = await getDocs(collection(alias.db, `tasks/${taskId}/attachments`))
      expect(snap.empty).toBe(false)
      attachmentData = snap.docs[0].data() as Record<string, unknown>
    })

    // Requirement, part 1: the persisted attachment must actually reference
    // real Storage-backed content, not an inline data URL — read the SUT's
    // OWN stored value, no path guessed on this test's behalf.
    const storedUrl = attachmentData?.storageUrl as string | undefined
    expect(storedUrl?.startsWith('data:')).toBe(false)

    // Requirement, part 2: a genuinely NEW Storage object must exist for
    // this upload — found by diffing the full real bucket listing
    // (independent of any assumed prefix), not by guessing a path.
    const [afterFiles] = await admin.bucket.getFiles()
    const newFiles = afterFiles.filter((f) => !namesBefore.has(f.name))
    expect(newFiles.length).toBeGreaterThan(0)
    const [downloaded] = await newFiles[0].download()
    expect(Buffer.compare(downloaded, Buffer.from(uploadedBytes))).toBe(0)

    // Only delete objects this test itself created.
    await admin.bucket.file(controlName).delete().catch(() => undefined)
    await Promise.all(newFiles.map((f) => f.delete().catch(() => undefined)))
  })

  it('TEST-T08.emulator.counter-recovery (G) — a failed counter write must not leave a permanent silent divergence', async () => {
    const uid = await signInRealHQ()
    const taskId = `${RUN_ID}-task2`
    await seedTask(taskId, uid)

    // Fault-injection: reject exactly the NEXT updateDoc call (the counter
    // increment — the only updateDoc call TaskDetailPage's uploadFile makes)
    // while every other SDK call (including the attachment addDoc) goes
    // through the real emulator via the passthrough wrapper above.
    const { updateDoc } = await import('firebase/firestore')
    vi.mocked(updateDoc).mockImplementationOnce(async () => {
      throw new Error('simulated transient network failure')
    })

    mountDetail(taskId)
    await screen.findByText('משימת בדיקה קבצים')
    await userEvent.setup().click(screen.getByRole('button', { name: /קבצים/ }))

    const file = new File([new Uint8Array([5, 6, 7])], 'small.bin', { type: 'application/octet-stream' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.setup().upload(input, file)

    await waitFor(() => {
      expect(screen.getByText('שגיאה בהעלאת הקובץ. נסה שוב.')).toBeInTheDocument()
    })

    // Requirement: no permanent divergence — either the attachment record
    // is rolled back, or the count is reconciled. Read back real state.
    const attachSnap = await getDocs(collection(alias.db, `tasks/${taskId}/attachments`))
    const { getDoc: realGetDoc, doc: realDoc } = await import('firebase/firestore')
    const taskSnap = await realGetDoc(realDoc(alias.db, 'tasks', taskId))
    const taskData = taskSnap.data() as Record<string, unknown> | undefined
    const attachmentCount = (taskData?.attachmentCount as number | undefined) ?? 0
    expect(attachSnap.size === 0 || attachmentCount === attachSnap.size).toBe(true)
  })
})
