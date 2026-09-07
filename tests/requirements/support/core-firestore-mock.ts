// Shared Firestore SDK boundary mock for components/core tests (layer V).
//
// This module fakes only the Firestore *transport* — subscription delivery,
// getDoc/addDoc/updateDoc/deleteDoc/writeBatch calls — never business logic
// (sorting, filtering, aggregation). Tests push exactly the snapshots they
// want delivered, in the order they want them delivered, and inspect the
// exact write calls recorded here. Ordering/filtering claims must be
// verified against real Firestore in the emulator/core lane, not invented
// here.
//
// Usage inside a test file (vi.mock is hoisted, so keep the factory body
// self-contained and only reference this module through the dynamic import):
//
//   vi.mock('firebase/firestore', async (importOriginal) => {
//     const actual = await importOriginal<typeof import('firebase/firestore')>()
//     const { buildFirestoreMock } = await import('../../support/core-firestore-mock')
//     return buildFirestoreMock(actual)
//   })
//
//   import { firestoreMock } from '../../support/core-firestore-mock'
//   beforeEach(() => firestoreMock.reset())

import { vi } from 'vitest'

export type FakeTimestamp = { seconds: number; nanoseconds: number; toDate: () => Date; toMillis: () => number }

export function makeTimestamp(date: Date): FakeTimestamp {
  const ms = date.getTime()
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1e6,
    toDate: () => new Date(ms),
    toMillis: () => ms,
  }
}

interface FakeRef {
  __path: string
  __kind: 'collection' | 'doc' | 'query'
  __constraints?: unknown[]
}

type SnapshotListener = {
  path: string
  onNext: (snap: unknown) => void
  onError?: (err: { message: string; code?: string }) => void
  live: boolean
}

type DocSnap = { id: string; data: Record<string, unknown> | undefined }

function fakeQuerySnapshot(_path: string, docs: DocSnap[]) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d.data,
      exists: () => d.data !== undefined,
    })),
    size: docs.length,
    empty: docs.length === 0,
    forEach(cb: (d: unknown) => void) {
      this.docs.forEach(cb)
    },
  }
}

function fakeDocSnapshot(id: string, data: Record<string, unknown> | undefined) {
  return {
    id,
    exists: () => data !== undefined,
    data: () => data,
  }
}

type GetDocGate = { path: string; resolve: (data: Record<string, unknown> | undefined) => void; reject: (err: Error) => void; promise: Promise<Record<string, unknown> | undefined> }

class FirestoreMockController {
  listeners: SnapshotListener[] = []
  docValues = new Map<string, Record<string, unknown> | undefined>()
  writeCalls: { kind: string; path: string; data?: unknown }[] = []
  pendingWriteResults: { kind: string; path?: string; result: 'resolve' | 'reject'; error?: Error }[] = []
  batchCommits: { kind: string; path: string; data?: unknown }[][] = []
  /** Every query(...) call's path + constraint objects, so tests can assert
   * what where()/orderBy()/limit() arguments a hook actually constructed
   * (e.g. whether a domain-scoping `where` clause was ever built), without
   * this transport-only mock pretending to enforce real query filtering. */
  queryCalls: { path: string; constraints: unknown[] }[] = []
  /** Paths whose next getDoc() call must be manually released via releaseGetDoc(path). Used to test race conditions (e.g. A04) where two profile reads resolve out of order. */
  gatedPaths = new Set<string>()
  private gates: GetDocGate[] = []

  reset() {
    this.listeners = []
    this.docValues.clear()
    this.writeCalls = []
    this.pendingWriteResults = []
    this.batchCommits = []
    this.queryCalls = []
    this.gatedPaths.clear()
    this.gates = []
  }

  /** Mark a doc path as gated: the next getDoc() call against it will not resolve until releaseGetDoc(path) is called. */
  gate(path: string) {
    this.gatedPaths.add(path)
  }

  /** Resolve the oldest pending gated getDoc() call for `path` with `data` (undefined = "no such document"). */
  releaseGetDoc(path: string, data: Record<string, unknown> | undefined) {
    const idx = this.gates.findIndex((g) => g.path === path)
    if (idx === -1) throw new Error(`No pending gated getDoc() for path "${path}"`)
    const [gate] = this.gates.splice(idx, 1)
    gate.resolve(data)
  }

  /** Reject the oldest pending gated getDoc() call for `path` (e.g. simulating a permission-denied listener/read error). */
  rejectGetDoc(path: string, error: Error) {
    const idx = this.gates.findIndex((g) => g.path === path)
    if (idx === -1) throw new Error(`No pending gated getDoc() for path "${path}"`)
    const [gate] = this.gates.splice(idx, 1)
    gate.reject(error)
  }

  /** Internal: called by the mocked getDoc(). Returns a promise honoring any active gate. */
  requestDoc(path: string): Promise<Record<string, unknown> | undefined> {
    if (this.gatedPaths.has(path)) {
      let resolveFn!: (data: Record<string, unknown> | undefined) => void
      let rejectFn!: (err: Error) => void
      const promise = new Promise<Record<string, unknown> | undefined>((res, rej) => {
        resolveFn = res
        rejectFn = rej
      })
      this.gates.push({ path, resolve: resolveFn, reject: rejectFn, promise })
      return promise
    }
    return Promise.resolve(this.docValues.get(path))
  }

  /** Deliver a query snapshot (array of {id, data}) to every live listener subscribed to `path`. */
  emitQuery(path: string, docs: DocSnap[]) {
    const snap = fakeQuerySnapshot(path, docs)
    for (const l of this.listeners) {
      if (l.live && l.path === path) l.onNext(snap)
    }
  }

  /** Deliver a document snapshot to every live listener subscribed to `path`. */
  emitDoc(path: string, data: Record<string, unknown> | undefined) {
    const snap = fakeDocSnapshot(path.split('/').pop()!, data)
    for (const l of this.listeners) {
      if (l.live && l.path === path) l.onNext(snap)
    }
  }

  /** Deliver a listener error to every live listener subscribed to `path`.
   * Matches real Firestore SDK semantics: an onSnapshot error callback is
   * terminal — the SDK does not deliver any further snapshots or errors to
   * that listener afterward; a caller must create a new subscription to
   * receive more data. This marks the listener inactive after firing, so a
   * later emitQuery/emitError to the same path never reaches it. */
  emitError(path: string, message: string, code = 'permission-denied') {
    for (const l of this.listeners) {
      if (l.live && l.path === path) {
        l.onError?.({ message, code })
        l.live = false
      }
    }
  }

  /** Number of currently-live (not-yet-unsubscribed) listeners on a path. */
  liveCount(path: string) {
    return this.listeners.filter((l) => l.live && l.path === path).length
  }

  /** Set the value getDoc(doc(db, ...path)) resolves with. Pass undefined for "not found". */
  setDocValue(path: string, data: Record<string, unknown> | undefined) {
    this.docValues.set(path, data)
  }

  /** Queue a write outcome (resolve/reject) consumed once by the next matching write call. */
  queueWriteResult(kind: string, result: 'resolve' | 'reject', error?: Error, path?: string) {
    this.pendingWriteResults.push({ kind, path, result, error })
  }

  consumeWriteOutcome(kind: string, path: string) {
    const idx = this.pendingWriteResults.findIndex(
      (p) => p.kind === kind && (p.path === undefined || p.path === path)
    )
    if (idx === -1) return { result: 'resolve' as const }
    const [entry] = this.pendingWriteResults.splice(idx, 1)
    return entry
  }

  async performWrite(kind: string, path: string, data?: unknown) {
    this.writeCalls.push({ kind, path, data })
    const outcome = this.consumeWriteOutcome(kind, path)
    if (outcome.result === 'reject') {
      throw outcome.error ?? new Error(`${kind} rejected`)
    }
  }
}

export const firestoreMock = new FirestoreMockController()

function refPath(ref: unknown): string {
  return (ref as FakeRef).__path
}

export function buildFirestoreMock(actual: Record<string, unknown>) {
  const collection = vi.fn((_db: unknown, path: string, ...segments: string[]): FakeRef => ({
    __kind: 'collection',
    __path: [path, ...segments].join('/'),
  }))

  const doc = vi.fn((parent: unknown, ...args: string[]): FakeRef => {
    if (parent && typeof parent === 'object' && '__path' in (parent as FakeRef)) {
      return { __kind: 'doc', __path: [(parent as FakeRef).__path, ...args].join('/') }
    }
    // doc(db, 'users', uid) form: first arg after db-sentinel is a collection path
    return { __kind: 'doc', __path: args.join('/') }
  })

  const query = vi.fn((ref: FakeRef, ...constraints: unknown[]): FakeRef => {
    firestoreMock.queryCalls.push({ path: ref.__path, constraints })
    return {
      __kind: 'query',
      __path: ref.__path,
      __constraints: constraints,
    }
  })

  const orderBy = vi.fn((field: string, direction?: string) => ({ __type: 'orderBy', field, direction }))
  const where = vi.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value }))
  const limit = vi.fn((n: number) => ({ __type: 'limit', n }))

  const onSnapshot = vi.fn(
    (
      ref: FakeRef,
      onNextOrObserver: ((snap: unknown) => void) | { next: (s: unknown) => void; error?: (e: unknown) => void },
      onError?: (err: unknown) => void
    ) => {
      const onNext = typeof onNextOrObserver === 'function' ? onNextOrObserver : onNextOrObserver.next
      const errorHandler =
        typeof onNextOrObserver === 'function' ? onError : onNextOrObserver.error
      const listener: SnapshotListener = {
        path: ref.__path,
        onNext,
        onError: errorHandler as SnapshotListener['onError'],
        live: true,
      }
      firestoreMock.listeners.push(listener)
      return () => {
        listener.live = false
      }
    }
  )

  const getDoc = vi.fn(async (ref: FakeRef) => {
    const path = refPath(ref)
    const data = await firestoreMock.requestDoc(path)
    return fakeDocSnapshot(path.split('/').pop()!, data)
  })

  const addDoc = vi.fn(async (ref: FakeRef, data: unknown) => {
    await firestoreMock.performWrite('addDoc', ref.__path, data)
    const id = `generated-${Math.random().toString(36).slice(2, 10)}`
    return { id, __path: `${ref.__path}/${id}` } as FakeRef & { id: string }
  })

  const setDoc = vi.fn(async (ref: FakeRef, data: unknown) => {
    await firestoreMock.performWrite('setDoc', ref.__path, data)
  })

  const updateDoc = vi.fn(async (ref: FakeRef, data: unknown) => {
    await firestoreMock.performWrite('updateDoc', ref.__path, data)
  })

  const deleteDoc = vi.fn(async (ref: FakeRef) => {
    await firestoreMock.performWrite('deleteDoc', ref.__path)
  })

  const serverTimestamp = vi.fn(() => ({ __type: 'serverTimestamp' }))
  const deleteField = vi.fn(() => ({ __type: 'deleteField' }))

  const writeBatch = vi.fn(() => {
    const ops: { kind: string; path: string; data?: unknown }[] = []
    return {
      update: (ref: FakeRef, data: unknown) => {
        ops.push({ kind: 'update', path: ref.__path, data })
      },
      set: (ref: FakeRef, data: unknown) => {
        ops.push({ kind: 'set', path: ref.__path, data })
      },
      delete: (ref: FakeRef) => {
        ops.push({ kind: 'delete', path: ref.__path })
      },
      commit: vi.fn(async () => {
        firestoreMock.batchCommits.push(ops.slice())
        for (const op of ops) {
          firestoreMock.writeCalls.push({ kind: `batch.${op.kind}`, path: op.path, data: op.data })
        }
        // Backward-compatible batch-commit rejection support: if a test has
        // queued { kind: 'batch.commit', result: 'reject' } via queueWriteResult(),
        // consume it here and throw. Consumers that don't queue anything still
        // resolve, preserving previous behavior.
        const outcome = firestoreMock.consumeWriteOutcome('batch.commit', '')
        if (outcome.result === 'reject') {
          throw outcome.error ?? new Error('batch.commit rejected')
        }
      }),
    }
  })

  return {
    ...actual,
    collection,
    doc,
    query,
    orderBy,
    where,
    limit,
    onSnapshot,
    getDoc,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    deleteField,
    writeBatch,
  }
}
