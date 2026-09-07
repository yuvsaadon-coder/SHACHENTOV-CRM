// TEST-T08 — Attachment storage contract (split: storage-roundtrip, counter-recovery, current-size-boundary).
// Requirements: T01 / T05a / T05c / T10a / T15b. Layer V.
// Classifications:
//   - T08.storage-roundtrip     (G) — Baseline P07 stores base64 data-URL in
//                                     Firestore. If NO firebase/storage call
//                                     happens on upload, this is a real gap.
//   - T08.counter-recovery      (G) — Baseline P07 changes attachmentCount in
//                                     a SECOND write; rejecting the counter
//                                     write leaves attachment doc present but
//                                     count wrong with no visible error.
//   - T08.current-size-boundary (C) — Characterize the literal 500 * 1024 byte
//                                     boundary TaskDetailPage.tsx:181 enforces.
//
// See TEST-PLAN.md §6.T row T08 and §6.1's T08 split entry.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

vi.mock('firebase/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/storage')>()
  const { buildStorageMock } = await import('../../support/core-storage-mock')
  return buildStorageMock(actual)
})

import { firestoreMock } from '../../support/core-firestore-mock'
import { authMock } from '../../support/core-auth-mock'
import { storageMock } from '../../support/core-storage-mock'
import { IDENTITIES, TASKS } from '../../support/core-fixtures'
import { AuthProvider } from '../../../../src/context/AuthContext'
import { ToastProvider } from '../../../../src/context/ToastContext'
import { TaskDetailPage } from '../../../../src/pages/TaskDetailPage'

const HQ = { uid: IDENTITIES.hqFin.uid, email: IDENTITIES.hqFin.email }
const HQ_PROFILE = {
  name: IDENTITIES.hqFin.name,
  email: IDENTITIES.hqFin.email,
  role: IDENTITIES.hqFin.role,
  active: true,
}
const TASK_ID = TASKS.fin.id
const TASK_DOC_DATA = (() => {
  const { id: _id, ...rest } = TASKS.fin
  return rest
})()

function mount() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/tasks/${TASK_ID}`]}>
          <Routes>
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

async function primeSignedInAndTaskLoaded() {
  firestoreMock.setDocValue(`users/${HQ.uid}`, HQ_PROFILE)
  firestoreMock.setDocValue(`tasks/${TASK_ID}`, TASK_DOC_DATA)
  authMock.currentUser = HQ

  const utils = mount()

  // Wait for AuthProvider to fire onAuthStateChanged and hydrate appUser.
  // Once appUser is set, TaskDetailPage will have already tried to load the
  // main task doc (getDoc) — but we still need to feed empty snapshots for
  // its three nested subscriptions so it doesn't stay pending.
  await waitFor(() =>
    expect(firestoreMock.liveCount(`tasks/${TASK_ID}/comments`)).toBe(1),
  )
  firestoreMock.emitQuery(`tasks/${TASK_ID}/comments`, [])
  firestoreMock.emitQuery(`tasks/${TASK_ID}/attachments`, [])
  firestoreMock.emitQuery(`tasks/${TASK_ID}/history`, [])
  // Subtasks live listener on the tasks collection with a where(parentTaskId).
  await waitFor(() => expect(firestoreMock.liveCount('tasks')).toBeGreaterThan(0))
  firestoreMock.emitQuery('tasks', [])

  await screen.findByText(TASKS.fin.title)
  return utils
}

async function switchToFilesTab() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /קבצים/ }))
}

// A minimal in-memory File whose .size and FileReader-decoded bytes we
// control precisely. FileReader is a jsdom global; we replace it per §4's
// V-layer allowance (mock FileReader behavior, not the production component).
function makeFile(bytes: Uint8Array, name = 'note.txt', type = 'text/plain'): File {
  return new File([bytes as BlobPart], name, { type })
}

// Replace FileReader with a deterministic implementation. TaskDetailPage
// calls reader.readAsDataURL(file); we synthesize a data URL from the file's
// blob contents. This is a boundary mock only — the component's own code is
// entirely untouched.
class DataUrlReader {
  onload: ((ev: { target: { result: string } }) => void) | null = null
  onerror: ((err: unknown) => void) | null = null
  result: string | null = null
  readAsDataURL(file: Blob) {
    // Read the bytes synchronously via .arrayBuffer() then fire onload.
    file.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf)
      let bin = ''
      for (const b of bytes) bin += String.fromCharCode(b)
      const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')
      const dataUrl = `data:${(file as File).type || 'application/octet-stream'};base64,${b64}`
      this.result = dataUrl
      this.onload?.({ target: { result: dataUrl } })
    }).catch((err) => this.onerror?.(err))
  }
}

let originalFileReader: typeof FileReader | undefined

beforeEach(() => {
  firestoreMock.reset()
  authMock.reset()
  storageMock.reset()
  originalFileReader = globalThis.FileReader
  ;(globalThis as unknown as { FileReader: unknown }).FileReader = DataUrlReader
})

afterEach(() => {
  if (originalFileReader) {
    ;(globalThis as unknown as { FileReader: typeof FileReader }).FileReader = originalFileReader
  }
})

import { afterEach } from 'vitest'

describe('TEST-T08 — attachment storage contract (V)', () => {
  it('TEST-T08.storage-roundtrip (G) — uploaded file bytes must be stored in Firebase Storage with metadata', async () => {
    await primeSignedInAndTaskLoaded()
    await switchToFilesTab()

    // Small harmless payload: 8 bytes.
    const file = makeFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'harmless.bin', 'application/octet-stream')

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()

    const user = userEvent.setup()
    await user.upload(input, file)

    // Requirement: the file bytes are uploaded to Firebase Storage, and
    // the persisted attachment metadata references that Storage object
    // (not an inline data-URL).
    await waitFor(() => {
      expect(storageMock.uploadBytesCalls, 'firebase/storage uploadBytes() must be called').toHaveLength(1)
    })
    const addAtt = firestoreMock.writeCalls.find(
      (w) => w.kind === 'addDoc' && w.path === `tasks/${TASK_ID}/attachments`,
    )
    expect(addAtt, 'expected addDoc into attachments subcollection').toBeTruthy()
    const payload = addAtt!.data as { fileName?: string; storageUrl?: string }
    expect(payload.fileName).toBe('harmless.bin')
    expect(payload.storageUrl, 'storageUrl must be a Storage download URL, not an inline data: URL').not.toMatch(/^data:/)
  })

  it('TEST-T08.counter-recovery (G) — rejected counter-write must not leave a permanent silent divergence', async () => {
    await primeSignedInAndTaskLoaded()
    await switchToFilesTab()

    // Queue the counter-side updateDoc write to reject.
    firestoreMock.queueWriteResult(
      'updateDoc',
      'reject',
      new Error('counter-write rejected'),
      `tasks/${TASK_ID}`,
    )

    const file = makeFile(new Uint8Array([9, 9, 9]), 'small.bin', 'application/octet-stream')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.setup().upload(input, file)

    await waitFor(() => {
      expect(screen.getByText('שגיאה בהעלאת הקובץ. נסה שוב.')).toBeInTheDocument()
    })

    // Requirement: no permanent divergence — either the attachment
    // metadata write is rolled back, or the count is reconciled to match
    // the real attachment set. Neither may hold indefinitely and silently.
    const attachmentAdds = firestoreMock.writeCalls.filter(
      (w) => w.kind === 'addDoc' && w.path === `tasks/${TASK_ID}/attachments`,
    )
    const counterWrites = firestoreMock.writeCalls.filter(
      (w) => w.kind === 'updateDoc' && w.path === `tasks/${TASK_ID}`,
    )
    // If an attachment record was committed, a corresponding counter
    // update must also have succeeded (recorded here as more than the
    // single rejected attempt already queued above).
    expect(attachmentAdds.length === 0 || counterWrites.length > 1).toBe(true)
  })

  it('TEST-T08.current-size-boundary (C) — 500 * 1024 byte constant from TaskDetailPage.tsx:181 is the accept/reject edge', async () => {
    await primeSignedInAndTaskLoaded()
    await switchToFilesTab()

    // Case A: exactly 500 KiB (= 500 * 1024 bytes) is ACCEPTED — the guard
    // is a strict > check (TaskDetailPage.tsx:181 `if (file.size > 500 * 1024)`).
    const AT_LIMIT = 500 * 1024
    const fileAt = makeFile(new Uint8Array(AT_LIMIT), 'at-limit.bin', 'application/octet-stream')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.setup().upload(input, fileAt)

    await waitFor(() => {
      const addAtt = firestoreMock.writeCalls.find(
        (w) => w.kind === 'addDoc' && w.path === `tasks/${TASK_ID}/attachments`,
      )
      expect(addAtt, 'a file of exactly 500 KiB is accepted').toBeTruthy()
    })

    // Reset writeCalls so the second case sees a clean slate.
    firestoreMock.writeCalls.length = 0

    // Case B: 500 KiB + 1 byte is REJECTED with the exact Hebrew error toast.
    const OVER_LIMIT = 500 * 1024 + 1
    const fileOver = makeFile(new Uint8Array(OVER_LIMIT), 'over-limit.bin', 'application/octet-stream')
    await userEvent.setup().upload(input, fileOver)

    await waitFor(() => {
      expect(screen.getByText('הקובץ גדול מדי — מקסימום 500 KB')).toBeInTheDocument()
    })
    // No addDoc into attachments occurred for the oversize file.
    const rejectedAdd = firestoreMock.writeCalls.find(
      (w) => w.kind === 'addDoc' && w.path === `tasks/${TASK_ID}/attachments`,
    )
    expect(rejectedAdd, 'oversize file must not produce an attachments addDoc').toBeFalsy()
  })
})
