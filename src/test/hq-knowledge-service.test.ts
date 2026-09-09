// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  applyHQKnowledgeOperation,
  HQKnowledgePartialFailure,
  type HQKnowledgeStore,
  type StoredDocument,
} from '../../netlify/functions/_shared/hq-knowledge-service'
import type { HQKnowledgeMutationItem } from '../lib/hqKnowledgeSchema'

function item(overrides: Partial<HQKnowledgeMutationItem> = {}): HQKnowledgeMutationItem {
  return {
    domain: 'all',
    category: 'instructions',
    title: 'Procedure',
    content: 'Steps',
    tags: ['operations'],
    visibleToCoordinators: false,
    ...overrides,
  }
}

function store(existing: StoredDocument = { exists: false, data: {} }): HQKnowledgeStore {
  return {
    getHQ: vi.fn().mockResolvedValue(existing),
    findMirrorIds: vi.fn().mockResolvedValue([]),
    commit: vi.fn().mockResolvedValue(undefined),
    deleteStorage: vi.fn().mockResolvedValue(undefined),
  }
}

describe('HQ knowledge lifecycle', () => {
  it('creates an HQ record without an attachment and does not create a mirror', async () => {
    const adapter = store()
    await applyHQKnowledgeOperation(adapter, { operation: 'create', id: 'new-id', item: item() }, 'admin-1', 'Admin')

    expect(adapter.commit).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'create',
      hqFields: expect.objectContaining({ fileUrl: null, storagePath: null }),
      mirrorFields: undefined,
    }))
  })

  it('creates a shared record with the same attachment fields in HQ and coordinator schemas', async () => {
    const adapter = store()
    const attachment = {
      fileUrl: 'https://example.test/file',
      fileName: 'guide.pdf',
      storagePath: 'hq_knowledge/new-id/file.pdf',
    }
    await applyHQKnowledgeOperation(adapter, {
      operation: 'create',
      id: 'new-id',
      item: item({ visibleToCoordinators: true, attachment }),
    }, 'admin-1', 'Admin')

    const commit = vi.mocked(adapter.commit).mock.calls[0][0]
    expect(commit.hqFields).toEqual(expect.objectContaining(attachment))
    expect(commit.mirrorFields).toEqual(expect.objectContaining({
      ...attachment,
      sourceHQId: 'new-id',
      branchId: 'global',
      type: 'file',
    }))
  })

  it('updates a shared attachment and cleans the replaced Storage object', async () => {
    const adapter = store({
      exists: true,
      data: {
        createdBy: 'Original',
        fileUrl: 'https://example.test/old',
        fileName: 'old.pdf',
        storagePath: 'hq_knowledge/id/old.pdf',
      },
    })
    const attachment = {
      fileUrl: 'https://example.test/new',
      fileName: 'new.pdf',
      storagePath: 'hq_knowledge/id/new.pdf',
    }

    await applyHQKnowledgeOperation(adapter, {
      operation: 'update',
      id: 'id',
      item: item({ visibleToCoordinators: true, attachment }),
    }, 'admin-1', 'Admin')

    expect(adapter.deleteStorage).toHaveBeenCalledWith('hq_knowledge/id/old.pdf')
    expect(adapter.commit).toHaveBeenCalledWith(expect.objectContaining({
      mirrorFields: expect.objectContaining({ fileUrl: attachment.fileUrl }),
    }))
  })

  it('removes an attachment and legacy duplicate mirrors when unsharing', async () => {
    const adapter = store({
      exists: true,
      data: {
        storageUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/hq_knowledge%2Fid%2Fold.pdf?alt=media',
        fileName: 'old.pdf',
      },
    })
    vi.mocked(adapter.findMirrorIds).mockResolvedValue(['legacy-mirror', 'hq-id'])

    await applyHQKnowledgeOperation(adapter, {
      operation: 'update',
      id: 'id',
      item: item({ visibleToCoordinators: false }),
    }, 'admin-1', 'Admin')

    expect(adapter.commit).toHaveBeenCalledWith(expect.objectContaining({
      mirrorFields: undefined,
      mirrorIdsToDelete: ['legacy-mirror', 'hq-id'],
    }))
    expect(adapter.deleteStorage).toHaveBeenCalledWith('hq_knowledge/id/old.pdf')
  })

  it('shares an existing attachment without deleting it', async () => {
    const attachment = {
      fileUrl: 'https://example.test/file',
      fileName: 'guide.pdf',
      storagePath: 'hq_knowledge/id/file.pdf',
    }
    const adapter = store({ exists: true, data: attachment })

    await applyHQKnowledgeOperation(adapter, {
      operation: 'update',
      id: 'id',
      item: item({ visibleToCoordinators: true, attachment }),
    }, 'admin-1', 'Admin')

    expect(adapter.deleteStorage).not.toHaveBeenCalled()
    expect(adapter.commit).toHaveBeenCalledWith(expect.objectContaining({
      mirrorFields: expect.objectContaining({ fileUrl: attachment.fileUrl }),
    }))
  })

  it('retains a legacy attachment with no stored path without deleting its object', async () => {
    const fileUrl = 'https://firebasestorage.googleapis.com/v0/b/test/o/hq_knowledge%2Fid%2Fguide.pdf?alt=media'
    const adapter = store({
      exists: true,
      data: { fileUrl, fileName: 'guide.pdf' },
    })

    await applyHQKnowledgeOperation(adapter, {
      operation: 'update',
      id: 'id',
      item: item({
        attachment: { fileUrl, fileName: 'guide.pdf' },
      }),
    }, 'admin-1', 'Admin')

    expect(adapter.deleteStorage).not.toHaveBeenCalled()
  })

  it('deletes the HQ record, all mirrors, and its attachment', async () => {
    const adapter = store({
      exists: true,
      data: {
        fileUrl: 'https://example.test/file',
        fileName: 'guide.pdf',
        storagePath: 'hq_knowledge/id/file.pdf',
      },
    })
    vi.mocked(adapter.findMirrorIds).mockResolvedValue(['legacy-mirror'])

    await applyHQKnowledgeOperation(adapter, { operation: 'delete', id: 'id' }, 'admin-1', 'Admin')

    expect(adapter.commit).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'delete',
      mirrorIdsToDelete: ['legacy-mirror', 'hq-id'],
    }))
    expect(adapter.deleteStorage).toHaveBeenCalledWith('hq_knowledge/id/file.pdf')
  })

  it('deletes records without attachments without attempting Storage cleanup', async () => {
    const adapter = store({ exists: true, data: { title: 'No file' } })
    await applyHQKnowledgeOperation(adapter, { operation: 'delete', id: 'id' }, 'admin-1', 'Admin')
    expect(adapter.deleteStorage).not.toHaveBeenCalled()
  })

  it('does not clean Storage when the atomic Firestore commit is interrupted', async () => {
    const adapter = store({
      exists: true,
      data: {
        fileUrl: 'https://example.test/file',
        fileName: 'guide.pdf',
        storagePath: 'hq_knowledge/id/file.pdf',
      },
    })
    vi.mocked(adapter.commit).mockRejectedValue(new Error('Firestore unavailable'))

    await expect(applyHQKnowledgeOperation(
      adapter,
      { operation: 'delete', id: 'id' },
      'admin-1',
      'Admin',
    )).rejects.toThrow('Firestore unavailable')
    expect(adapter.deleteStorage).not.toHaveBeenCalled()
  })

  it('reports a partial failure when post-commit Storage cleanup fails', async () => {
    const adapter = store({
      exists: true,
      data: {
        fileUrl: 'https://example.test/file',
        fileName: 'guide.pdf',
        storagePath: 'hq_knowledge/id/file.pdf',
      },
    })
    vi.mocked(adapter.deleteStorage).mockRejectedValue(new Error('Storage unavailable'))

    const operation = applyHQKnowledgeOperation(
      adapter,
      { operation: 'delete', id: 'id' },
      'admin-1',
      'Admin',
    )
    await expect(operation).rejects.toBeInstanceOf(HQKnowledgePartialFailure)
    await expect(operation).rejects.toMatchObject({
      operationApplied: true,
      cleanupPaths: ['hq_knowledge/id/file.pdf'],
    })
  })
})
