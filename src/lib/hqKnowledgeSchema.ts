export interface HQKnowledgeAttachment {
  fileUrl: string
  fileName: string
  storagePath?: string
}

export interface HQKnowledgeMutationItem {
  domain: string
  category: string
  title: string
  content: string
  tags: string[]
  visibleToCoordinators: boolean
  attachment?: HQKnowledgeAttachment
}

export interface LegacyAttachmentFields {
  fileUrl?: unknown
  storageUrl?: unknown
  fileName?: unknown
  storagePath?: unknown
}

export function normalizeAttachment(value: LegacyAttachmentFields): HQKnowledgeAttachment | undefined {
  const fileUrl = typeof value.fileUrl === 'string'
    ? value.fileUrl
    : typeof value.storageUrl === 'string'
      ? value.storageUrl
      : undefined
  if (!fileUrl) return undefined

  return {
    fileUrl,
    fileName: typeof value.fileName === 'string' && value.fileName ? value.fileName : 'קובץ',
    storagePath: typeof value.storagePath === 'string' ? value.storagePath : storagePathFromDownloadUrl(fileUrl),
  }
}

export function storagePathFromDownloadUrl(fileUrl: string): string | undefined {
  try {
    const url = new URL(fileUrl)
    const marker = '/o/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex < 0) return undefined
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
  } catch {
    return undefined
  }
}

export function hqRecordFields(item: HQKnowledgeMutationItem): Record<string, unknown> {
  return {
    domain: item.domain,
    category: item.category,
    title: item.title,
    content: item.content,
    tags: item.tags,
    visibleToCoordinators: item.visibleToCoordinators,
    fileUrl: item.attachment?.fileUrl ?? null,
    fileName: item.attachment?.fileName ?? null,
    storagePath: item.attachment?.storagePath ?? null,
  }
}

export function coordinatorMirrorFields(
  sourceHQId: string,
  item: HQKnowledgeMutationItem,
  createdBy: string,
): Record<string, unknown> {
  return {
    branchId: 'global',
    type: item.attachment ? 'file' : 'document',
    title: item.title,
    content: item.content,
    tags: item.tags,
    fileUrl: item.attachment?.fileUrl ?? null,
    fileName: item.attachment?.fileName ?? null,
    storagePath: item.attachment?.storagePath ?? null,
    sourceHQId,
    source: 'hq',
    createdBy,
  }
}

export function normalizeKnowledgeDocument<T extends Record<string, unknown>>(data: T): T {
  const attachment = normalizeAttachment(data)
  if (!attachment) return data
  if (
    data.fileUrl === attachment.fileUrl
    && data.fileName === attachment.fileName
    && data.storagePath === attachment.storagePath
  ) return data
  return { ...data, ...attachment }
}
