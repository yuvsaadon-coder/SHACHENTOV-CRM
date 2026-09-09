import {
  coordinatorMirrorFields,
  hqRecordFields,
  normalizeAttachment,
  type HQKnowledgeMutationItem,
} from '../../../src/lib/hqKnowledgeSchema'

export type HQKnowledgeOperation = 'create' | 'update' | 'delete'

export interface HQKnowledgeRequest {
  operation: HQKnowledgeOperation
  id: string
  item?: HQKnowledgeMutationItem
}

export interface StoredDocument {
  exists: boolean
  data: Record<string, unknown>
}

export interface HQKnowledgeStore {
  getHQ(id: string): Promise<StoredDocument>
  findMirrorIds(id: string): Promise<string[]>
  commit(input: {
    operation: HQKnowledgeOperation
    id: string
    hqFields?: Record<string, unknown>
    mirrorFields?: Record<string, unknown>
    mirrorIdsToDelete: string[]
    createdBy: string
  }): Promise<void>
  deleteStorage(path: string): Promise<void>
}

export class HQKnowledgePartialFailure extends Error {
  readonly operationApplied = true
  readonly cleanupPaths: string[]

  constructor(cleanupPaths: string[]) {
    super('השינוי נשמר, אך ניקוי הקובץ הישן נכשל. אפשר לנסות שוב בבטחה.')
    this.cleanupPaths = cleanupPaths
  }
}

function validateRequest(request: HQKnowledgeRequest): void {
  if (!request.id || !/^[A-Za-z0-9_-]+$/.test(request.id)) throw new Error('Invalid knowledge item id')
  if (request.operation === 'delete') return
  if (!request.item) throw new Error('Missing knowledge item')
  if (!request.item.title.trim()) throw new Error('Knowledge item title is required')
  if (!Array.isArray(request.item.tags)) throw new Error('Knowledge item tags must be an array')
  if (request.item.attachment && (!request.item.attachment.fileUrl || !request.item.attachment.fileName)) {
    throw new Error('Attachment URL and name are required')
  }
  if (
    request.item.attachment?.storagePath
    && !request.item.attachment.storagePath.startsWith(`hq_knowledge/${request.id}/`)
  ) {
    throw new Error('Attachment Storage path does not belong to this knowledge item')
  }
}

export async function applyHQKnowledgeOperation(
  store: HQKnowledgeStore,
  request: HQKnowledgeRequest,
  actorUid: string,
  actorName: string,
): Promise<void> {
  validateRequest(request)

  const existing = await store.getHQ(request.id)
  if (request.operation === 'create' && existing.exists) throw new Error('Knowledge item already exists')
  if (request.operation !== 'create' && !existing.exists) throw new Error('Knowledge item not found')

  const existingAttachment = normalizeAttachment(existing.data)
  const mirrorIds = await store.findMirrorIds(request.id)
  const canonicalMirrorId = `hq-${request.id}`
  const shouldMirror = request.operation !== 'delete' && request.item?.visibleToCoordinators === true
  const mirrorIdsToDelete = mirrorIds.filter((id) => !shouldMirror || id !== canonicalMirrorId)
  if (!shouldMirror && !mirrorIdsToDelete.includes(canonicalMirrorId)) mirrorIdsToDelete.push(canonicalMirrorId)

  const createdBy = request.operation === 'create'
    ? actorName || actorUid
    : typeof existing.data.createdBy === 'string'
      ? existing.data.createdBy
      : actorName || actorUid

  await store.commit({
    operation: request.operation,
    id: request.id,
    hqFields: request.item ? hqRecordFields(request.item) : undefined,
    mirrorFields: shouldMirror && request.item
      ? coordinatorMirrorFields(request.id, request.item, createdBy)
      : undefined,
    mirrorIdsToDelete,
    createdBy,
  })

  const nextAttachment = request.item?.attachment
  if (nextAttachment && existingAttachment?.fileUrl === nextAttachment.fileUrl) return
  const nextPath = nextAttachment?.storagePath
  const obsoletePath = existingAttachment?.storagePath
  if (!obsoletePath || obsoletePath === nextPath) return
  if (!obsoletePath.startsWith(`hq_knowledge/${request.id}/`)) {
    throw new HQKnowledgePartialFailure([obsoletePath])
  }

  try {
    await store.deleteStorage(obsoletePath)
  } catch {
    throw new HQKnowledgePartialFailure([obsoletePath])
  }
}
