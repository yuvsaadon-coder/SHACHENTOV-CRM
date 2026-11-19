// שכבת הנתונים. כל כתיבה של מסמך נעשית ב-batch אחד יחד עם רשומת היסטוריה -
// כללי האבטחה דוחים כל שינוי שאין לו רשומת היסטוריה תואמת.

import {
  collection, collectionGroup, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, setDoc, deleteDoc, where, writeBatch, type DocumentData, type Timestamp,
} from 'firebase/firestore'
import { deleteObject, getBlob, ref, uploadBytesResumable } from 'firebase/storage'
import { db, storage } from './firebase.ts'
import {
  canSeeRestricted, contentTypeFor, diffInputs, downloadName, normalizeInput, pickInput, safeFileName,
  type AppUser, type ArchiveDoc, type DocInput, type HistoryEntry, type Role,
} from './model.ts'
import { computeKeys, validateTaxonomyChange, type Taxonomy } from './taxonomy.ts'

const toDate = (v: unknown): Date | null => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : null)

function fromFirestore(id: string, d: DocumentData): ArchiveDoc {
  return {
    id,
    seq: d.seq ?? 0,
    author: d.author ?? '',
    title: d.title ?? '',
    folder: d.folder ?? '',
    docType: d.docType ?? '',
    status: d.status ?? '',
    publisher: d.publisher ?? '',
    forum: d.forum ?? [],
    dimension: d.dimension ?? [],
    responsibility: d.responsibility ?? [],
    unit: d.unit ?? [],
    leg: d.leg ?? [],
    topic: d.topic ?? [],
    stakeholderCircle: d.stakeholderCircle ?? [],
    chapter: d.chapter ?? [],
    meetingDate: d.meetingDate ?? null,
    year: d.year ?? null,
    summary: d.summary ?? '',
    restricted: d.restricted === true,
    versionLabel: d.versionLabel ?? '',
    links: d.links ?? [],
    linkTargets: d.linkTargets ?? [],
    familyId: d.familyId ?? id,
    isCurrent: d.isCurrent !== false,
    archived: d.archived === true,
    file: d.file ?? null,
    originalName: d.originalName ?? '',
    createdBy: d.createdBy ?? '',
    createdAt: toDate(d.createdAt),
    updatedBy: d.updatedBy ?? '',
    updatedAt: toDate(d.updatedAt),
    rev: d.rev ?? 0,
  }
}

// ---------- משתמש וטקסונומיה ----------

export async function loadMyUser(email: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', email.toLowerCase()))
  if (!snap.exists()) return null
  const d = snap.data()
  return { email: email.toLowerCase(), role: d.role as Role, active: d.active === true, name: d.name }
}

export function subscribeTaxonomy(cb: (t: Taxonomy | null) => void, onError: (e: Error) => void) {
  return onSnapshot(doc(db, 'config', 'taxonomy'), (s) => cb(s.exists() ? (s.data() as Taxonomy) : null), onError)
}

export async function saveTaxonomy(before: Taxonomy, after: Taxonomy, byEmail: string) {
  const errors = validateTaxonomyChange(before, after)
  if (errors.length) throw new Error(errors.join('\n'))
  const { keys: _ignored, ...rest } = after
  void _ignored
  await setDoc(doc(db, 'config', 'taxonomy'), {
    ...rest,
    version: before.version + 1,
    keys: computeKeys(after),
    updatedBy: byEmail,
    updatedAt: serverTimestamp(),
  })
}

// ---------- מסמכים ----------

export function subscribeDocs(role: Role, cb: (docs: ArchiveDoc[]) => void, onError: (e: Error) => void) {
  const base = collection(db, 'documents')
  // צופה חייב לסנן מסמכים מוגבלים בשאילתה עצמה - אחרת כללי האבטחה דוחים את כל השאילתה
  const q = canSeeRestricted(role) ? query(base) : query(base, where('restricted', '==', false))
  return onSnapshot(q, (s) => cb(s.docs.map((d) => fromFirestore(d.id, d.data()))), onError)
}

export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function findDuplicate(docs: ArchiveDoc[], hash: string): ArchiveDoc | undefined {
  return docs.find((d) => d.file?.sha256 === hash)
}

function storedFields(input: DocInput) {
  const n = normalizeInput(input)
  return { ...n, linkTargets: [...new Set(n.links.map((l) => l.to))] }
}

export interface CreateParams {
  input: DocInput
  file: File
  sha256: string
  versionOf: ArchiveDoc | null
  byEmail: string
  rationale?: string
  onProgress?: (pct: number) => void
}

export async function createDocument(p: CreateParams): Promise<string> {
  const contentType = contentTypeFor(p.file.name)
  if (!contentType) throw new Error('סוג הקובץ אינו נתמך')
  const newRef = doc(collection(db, 'documents'))
  const id = newRef.id
  const name = safeFileName(p.file.name)
  const path = `files/${id}/${name}`

  // 1. העלאת הקובץ (הכללים מתירים העלאה רק למסמך שעדיין לא קיים)
  const task = uploadBytesResumable(ref(storage, path), p.file, {
    contentType,
    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(p.file.name)}`,
    customMetadata: { uploadedBy: p.byEmail },
  })
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', (s) => p.onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, () => resolve())
  })
  // הקובץ נשמר בדיוק כפי שהוא (בייטים גולמיים, בלי המרה). מוודאים שהגודל שנשמר זהה למקור.
  if (task.snapshot.metadata.size !== p.file.size) {
    await deleteObject(ref(storage, path)).catch(() => undefined)
    throw new Error('הקובץ שנשמר אינו זהה למקור (גודל שונה) - ההעלאה בוטלה')
  }

  // 2. טרנזקציה אחת: הקצאת מזהה קבוע (מונה) + רשומת המסמך + היסטוריה (+ סימון הגרסה הקודמת כלא-נוכחית).
  //    כללי האבטחה מוודאים שהמספר שהוקצה הוא בדיוק הערך הבא של המונה - אין כפילויות גם בהעלאות במקביל.
  const fields = storedFields(p.input)
  const counterRef = doc(db, 'config', 'counter')
  const commit = () => runTransaction(db, async (tx) => {
    // המספר הפנוי הבא: מתחילים מהמונה ומדלגים על מספרים שכבר שוריינו (למשל בייבוא הקטלוג)
    const counter = await tx.get(counterRef)
    let seq = (counter.data()?.next as number | undefined) ?? 1
    for (let i = 0; i < 200 && (await tx.get(doc(db, 'seqs', String(seq)))).exists(); i++) seq++
    tx.set(counterRef, { next: seq + 1 })
    tx.set(doc(db, 'seqs', String(seq)), { doc: id })
    tx.set(newRef, {
      seq,
      ...fields,
      familyId: p.versionOf ? p.versionOf.familyId : id,
      isCurrent: true,
      archived: false,
      file: { path, name, size: p.file.size, contentType, sha256: p.sha256 },
      originalName: p.file.name.slice(0, 300),
      createdBy: p.byEmail,
      createdAt: serverTimestamp(),
      updatedBy: p.byEmail,
      updatedAt: serverTimestamp(),
      rev: 1,
    })
    tx.set(doc(db, 'documents', id, 'history', '1'), {
      rev: 1,
      by: p.byEmail,
      at: serverTimestamp(),
      action: p.versionOf ? 'new-version' : 'create',
      changes: { ...diffInputs({}, fields), ...(p.rationale ? { rationale: { from: null, to: p.rationale } } : {}) },
    })
    if (p.versionOf) {
      const old = p.versionOf
      const rev = old.rev + 1
      tx.update(doc(db, 'documents', old.id), { isCurrent: false, rev, updatedBy: p.byEmail, updatedAt: serverTimestamp() })
      tx.set(doc(db, 'documents', old.id, 'history', String(rev)), {
        rev, by: p.byEmail, at: serverTimestamp(), action: 'superseded', changes: { isCurrent: { from: true, to: false }, supersededBy: { from: null, to: id } },
      })
    }
  })
  try {
    await commit()
  } catch (e) {
    // הקובץ עלה אבל הרשומה נדחתה - מנסים לנקות (יצליח רק למנהל; אחרת יוצג בדוח קבצים יתומים)
    await deleteObject(ref(storage, path)).catch(() => undefined)
    throw e
  }
  return id
}

type UpdateAction = 'update' | 'archive' | 'restore'

export async function updateDocument(old: ArchiveDoc, input: DocInput, byEmail: string, action: UpdateAction = 'update', extra: Partial<Pick<ArchiveDoc, 'archived'>> = {}, rationale = '') {
  const fields = storedFields(input)
  const changes = diffInputs(pickInput(old), fields)
  if (extra.archived !== undefined && extra.archived !== old.archived) changes.archived = { from: old.archived, to: extra.archived }
  if (!Object.keys(changes).length) return
  if (rationale) changes.rationale = { from: null, to: rationale.slice(0, 1000) }
  const rev = old.rev + 1
  const batch = writeBatch(db)
  batch.update(doc(db, 'documents', old.id), { ...fields, ...extra, rev, updatedBy: byEmail, updatedAt: serverTimestamp() })
  batch.set(doc(db, 'documents', old.id, 'history', String(rev)), { rev, by: byEmail, at: serverTimestamp(), action, changes })
  await batch.commit()
}

export function setArchived(d: ArchiveDoc, archived: boolean, byEmail: string) {
  return updateDocument(d, pickInput(d), byEmail, archived ? 'archive' : 'restore', { archived })
}

/** הופך גרסה מסוימת לנוכחית במשפחה שלה (למשל כשגרסה חדשה הועלתה בטעות) */
export async function makeCurrent(target: ArchiveDoc, family: ArchiveDoc[], byEmail: string) {
  const batch = writeBatch(db)
  for (const d of family) {
    const want = d.id === target.id
    if (d.isCurrent === want) continue
    const rev = d.rev + 1
    batch.update(doc(db, 'documents', d.id), { isCurrent: want, rev, updatedBy: byEmail, updatedAt: serverTimestamp() })
    batch.set(doc(db, 'documents', d.id, 'history', String(rev)), {
      rev, by: byEmail, at: serverTimestamp(), action: want ? 'restore' : 'superseded', changes: { isCurrent: { from: d.isCurrent, to: want } },
    })
  }
  await batch.commit()
}

/** מחיקה לצמיתות - מנהלים בלבד. ההיסטוריה נשארת. */
export async function deleteDocumentForever(d: ArchiveDoc) {
  if (d.file) await deleteObject(ref(storage, d.file.path)).catch(() => undefined)
  await deleteDoc(doc(db, 'documents', d.id))
}

/**
 * הורדה דרך ה-SDK (getBlob) ולא דרך קישור הורדה ציבורי (getDownloadURL):
 * כך כל הורדה עוברת את כללי האבטחה, ואין קישורים "פתוחים" שאפשר להעביר הלאה.
 */
export async function downloadFile(d: ArchiveDoc): Promise<void> {
  if (!d.file) throw new Error('למסמך אין קובץ')
  const blob = await getBlob(ref(storage, d.file.path))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName(d)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function loadHistory(docId: string): Promise<HistoryEntry[]> {
  const s = await getDocs(query(collection(db, 'documents', docId, 'history'), orderBy('at', 'desc')))
  return s.docs.map((h) => {
    const d = h.data()
    return { rev: d.rev, by: d.by, at: toDate(d.at), action: d.action, changes: d.changes ?? {} }
  })
}

export async function loadRecentActivity(max = 100): Promise<(HistoryEntry & { docId: string })[]> {
  const s = await getDocs(query(collectionGroup(db, 'history'), orderBy('at', 'desc'), limit(max)))
  return s.docs.map((h) => {
    const d = h.data()
    return { docId: h.ref.parent.parent?.id ?? '', rev: d.rev, by: d.by, at: toDate(d.at), action: d.action, changes: d.changes ?? {} }
  })
}

// ---------- ניהול משתמשים ----------

export async function listUsers(): Promise<AppUser[]> {
  const s = await getDocs(collection(db, 'users'))
  return s.docs.map((u) => ({ email: u.id, role: u.data().role, active: u.data().active === true, name: u.data().name }))
}

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/

export async function upsertUser(u: AppUser, byEmail: string) {
  const email = u.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new Error('כתובת מייל לא תקינה')
  await setDoc(doc(db, 'users', email), {
    role: u.role,
    active: u.active,
    name: (u.name ?? '').slice(0, 100),
    updatedBy: byEmail,
    updatedAt: serverTimestamp(),
  })
}

export function removeUser(email: string) {
  return deleteDoc(doc(db, 'users', email.toLowerCase()))
}

// ---------- הגדרה ראשונית וייבוא מתוך האתר ----------

/** האם המערכת כבר הוגדרה (קיים מבנה תיוק) */
export async function isSetUp(): Promise<boolean> {
  return (await getDoc(doc(db, 'config', 'taxonomy'))).exists()
}

/**
 * הגדרה ראשונית: מבנה התיוק, המונה, והמשתמש/ת הנוכחי/ת כמנהל/ת - בפעולה אחת.
 * כללי האבטחה מתירים זאת רק כשהמערכת עוד ריקה, ולכן זה קורה פעם אחת בלבד.
 */
export async function firstRunSetup(email: string, tax: Taxonomy, counterStart: number) {
  const me = email.toLowerCase()
  const { keys: _k, ...rest } = tax as Taxonomy & { $comment?: string }
  void _k
  delete (rest as Record<string, unknown>).$comment
  const batch = writeBatch(db)
  batch.set(doc(db, 'config', 'taxonomy'), { ...rest, keys: computeKeys(tax), updatedBy: me, updatedAt: serverTimestamp() })
  batch.set(doc(db, 'config', 'counter'), { next: counterStart })
  batch.set(doc(db, 'users', me), { role: 'admin', active: true, name: '', updatedBy: me, updatedAt: serverTimestamp() })
  await batch.commit()
}

export async function existingIds(ids: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  await Promise.all(ids.map(async (id) => { if ((await getDoc(doc(db, 'documents', id))).exists()) found.add(id) }))
  return found
}

export interface ImportParams {
  id: string
  seq: number
  input: DocInput
  familyId: string
  isCurrent: boolean
  file: File
  rationale: string
  byEmail: string
}

/** מייבא רשומת קטלוג אחת עם המזהה הקבוע שלה (AK-###). הקובץ נשמר בדיוק כפי שהוא. */
export async function importEntry(p: ImportParams) {
  const contentType = contentTypeFor(p.file.name)
  if (!contentType) throw new Error(`סוג קובץ לא נתמך: ${p.file.name}`)
  const name = safeFileName(p.file.name)
  const path = `files/${p.id}/${name}`
  const sha256 = await sha256Hex(p.file)
  const task = uploadBytesResumable(ref(storage, path), p.file, {
    contentType,
    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(p.file.name)}`,
    customMetadata: { uploadedBy: p.byEmail },
  })
  await new Promise<void>((resolve, reject) => task.on('state_changed', undefined, reject, () => resolve()))
  if (task.snapshot.metadata.size !== p.file.size) throw new Error(`הקובץ שנשמר אינו זהה למקור: ${p.file.name}`)
  const fields = storedFields(p.input)
  const batch = writeBatch(db)
  batch.set(doc(db, 'documents', p.id), {
    seq: p.seq,
    ...fields,
    familyId: p.familyId,
    isCurrent: p.isCurrent,
    archived: false,
    file: { path, name, size: p.file.size, contentType, sha256 },
    originalName: p.file.name.slice(0, 300),
    createdBy: p.byEmail,
    createdAt: serverTimestamp(),
    updatedBy: p.byEmail,
    updatedAt: serverTimestamp(),
    rev: 1,
  })
  batch.set(doc(db, 'seqs', String(p.seq)), { doc: p.id })
  batch.set(doc(db, 'documents', p.id, 'history', '1'), {
    rev: 1, by: p.byEmail, at: serverTimestamp(), action: 'create',
    changes: { ...diffInputs({}, fields), importedFrom: { from: null, to: p.file.name }, rationale: { from: null, to: p.rationale.slice(0, 1000) } },
  })
  await batch.commit()
}
