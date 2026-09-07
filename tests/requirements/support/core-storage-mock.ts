// Shared Firebase Storage SDK boundary mock for components/core tests
// (layer V). Fakes only the Storage transport — ref/uploadBytes/getDownloadURL
// call surface — never asserts anything about production business logic.
//
// Usage (identical to core-firestore-mock / core-auth-mock):
//
//   vi.mock('firebase/storage', async (importOriginal) => {
//     const actual = await importOriginal<typeof import('firebase/storage')>()
//     const { buildStorageMock } = await import('../../support/core-storage-mock')
//     return buildStorageMock(actual)
//   })
//
//   import { storageMock } from '../../support/core-storage-mock'
//   beforeEach(() => storageMock.reset())
//
// The controller exposes recorded call arrays so T08 can assert whether
// `uploadBytes` / `ref` were even invoked — not whether source text
// mentions Storage.

import { vi } from 'vitest'

interface FakeStorageRef { __path: string; __kind: 'storageRef' }

class StorageMockController {
  refCalls: { path: string }[] = []
  uploadBytesCalls: { path: string; bytes: unknown; metadata?: unknown }[] = []
  uploadStringCalls: { path: string; data: string; format?: string; metadata?: unknown }[] = []
  getDownloadURLCalls: { path: string }[] = []
  deleteObjectCalls: { path: string }[] = []

  reset() {
    this.refCalls = []
    this.uploadBytesCalls = []
    this.uploadStringCalls = []
    this.getDownloadURLCalls = []
    this.deleteObjectCalls = []
  }
}

export const storageMock = new StorageMockController()

export function buildStorageMock(actual: Record<string, unknown>) {
  const getStorage = vi.fn(() => ({ __kind: 'storage' }))

  const ref = vi.fn((_storage: unknown, path: string): FakeStorageRef => {
    storageMock.refCalls.push({ path })
    return { __path: path, __kind: 'storageRef' }
  })

  const uploadBytes = vi.fn(async (r: FakeStorageRef, bytes: unknown, metadata?: unknown) => {
    storageMock.uploadBytesCalls.push({ path: r.__path, bytes, metadata })
    return { ref: r, metadata: { fullPath: r.__path, ...(metadata as object) } }
  })

  const uploadString = vi.fn(async (r: FakeStorageRef, data: string, format?: string, metadata?: unknown) => {
    storageMock.uploadStringCalls.push({ path: r.__path, data, format, metadata })
    return { ref: r, metadata: { fullPath: r.__path } }
  })

  const getDownloadURL = vi.fn(async (r: FakeStorageRef) => {
    storageMock.getDownloadURLCalls.push({ path: r.__path })
    return `https://fake-storage.example.test/${encodeURIComponent(r.__path)}`
  })

  const deleteObject = vi.fn(async (r: FakeStorageRef) => {
    storageMock.deleteObjectCalls.push({ path: r.__path })
  })

  return {
    ...actual,
    getStorage,
    ref,
    uploadBytes,
    uploadString,
    getDownloadURL,
    deleteObject,
  }
}
