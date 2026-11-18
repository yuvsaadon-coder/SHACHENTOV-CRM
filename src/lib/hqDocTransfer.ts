import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { OFFICIAL_DOC_LABELS } from '../types'
import type {
  DriveItemType, DriveLinkCategory, FinanceDocStatus, FinanceDocType,
  HQDriveLink, HQFinanceDoc, HQOfficialDoc, OfficialDocSubtype,
} from '../types'

export type DocKind = 'drive' | 'finance' | 'official'

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  drive: 'מסמכי דרייב',
  finance: 'דוחות כספיים',
  official: 'טפסים רשמיים',
}

const COLLECTION: Record<DocKind, string> = {
  drive: 'hq_drive_links',
  finance: 'hq_finance',
  official: 'hq_official_docs',
}

/** The part of a document that every kind has: a name, a place to open it, notes. */
export interface DocSource {
  kind: DocKind
  id: string
  name: string
  url: string
  fileName?: string
  notes?: string
  year?: number
  period?: string
}

/** What the destination kind needs and the source may not have. */
export interface TransferExtras {
  driveType: DriveItemType
  category: DriveLinkCategory
  docType: FinanceDocType
  period: string
  status: FinanceDocStatus
  subtype: OfficialDocSubtype
  year?: number
  registrationNumber?: string
}

const yearOf = (period?: string) => {
  const m = period?.match(/\d{4}/)
  return m ? Number(m[0]) : undefined
}

export const fromDrive = (l: HQDriveLink): DocSource => ({
  kind: 'drive', id: l.id, name: l.name, url: l.url, notes: l.notes, year: l.year,
})

export const fromFinance = (d: HQFinanceDoc): DocSource => ({
  kind: 'finance', id: d.id, name: d.title, url: d.fileUrl ?? '', fileName: d.fileName,
  notes: d.notes, period: d.period, year: yearOf(d.period),
})

export const fromOfficial = (d: HQOfficialDoc): DocSource => ({
  kind: 'official', id: d.id,
  name: `${OFFICIAL_DOC_LABELS[d.subtype]}${d.registrationNumber ? ` ${d.registrationNumber}` : ''}`,
  url: d.fileUrl ?? '', fileName: d.fileName, notes: d.notes, year: d.year,
})

export function defaultExtras(s: DocSource): TransferExtras {
  return {
    driveType: 'document', category: 'other', docType: 'other', status: 'final',
    subtype: 'registration', period: s.period ?? (s.year ? String(s.year) : ''), year: s.year,
  }
}

const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T

export function buildTarget(s: DocSource, to: DocKind, x: TransferExtras): object {
  if (to === 'drive') {
    return clean({ name: s.name, url: s.url, driveType: x.driveType, category: x.category, year: x.year ?? s.year, notes: s.notes, active: true })
  }
  if (to === 'finance') {
    return clean({ title: s.name, docType: x.docType, period: x.period, status: x.status, fileUrl: s.url, fileName: s.fileName, notes: s.notes, active: true })
  }
  // Official documents have no name of their own — keep the old name in the notes.
  const notes = [s.name, s.notes].filter(Boolean).join('\n')
  return clean({ subtype: x.subtype, year: x.year ?? s.year, registrationNumber: x.registrationNumber, fileUrl: s.url, fileName: s.fileName, notes, active: true })
}

/** Creates the document in its new place and deletes the old one in one atomic batch. */
export async function transferDoc(s: DocSource, to: DocKind, x: TransferExtras, uid: string) {
  const batch = writeBatch(db)
  batch.set(doc(collection(db, COLLECTION[to])), {
    ...buildTarget(s, to, x),
    createdBy: uid,
    updatedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.delete(doc(db, COLLECTION[s.kind], s.id))
  await batch.commit()
}
