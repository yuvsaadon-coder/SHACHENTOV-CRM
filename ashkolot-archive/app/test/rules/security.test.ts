// בדיקות לכללי האבטחה מול אמולטורי Firestore ו-Storage.
// הרצה: npm run test:rules (מתוך תיקיית app)

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore,
} from 'firebase/firestore'
import { ref, uploadBytes, getBytes } from 'firebase/storage'
import taxJson from '../../../taxonomy/taxonomy.json'
import { computeKeys, type Taxonomy } from '../../src/lib/taxonomy.ts'

const ROOT = new URL('../../../', import.meta.url)
let env: RulesTestEnvironment

const tax = taxJson as unknown as Taxonomy
const keys = computeKeys(tax)

const SHA = 'a'.repeat(64)

function ctx(email: string, opts: { verified?: boolean; provider?: string } = {}) {
  return env.authenticatedContext(email, {
    email,
    email_verified: opts.verified ?? true,
    firebase: { sign_in_provider: opts.provider ?? 'google.com' },
  } as never)
}
const fs = (email: string, opts?: { verified?: boolean; provider?: string }) => ctx(email, opts).firestore() as unknown as Firestore

function docFields(email: string, id: string, over: Record<string, unknown> = {}) {
  return {
    title: 'ניתוח SWOT', folder: '04', docType: 'analysis', status: 'draft', publisher: 'program',
    forum: ['social'], dimension: [], responsibility: [], unit: [], leg: [], topic: [], stakeholderCircle: [], chapter: [],
    meetingDate: null, year: 2026, summary: '', author: '', seq: 100, restricted: false, versionLabel: '', links: [], linkTargets: [],
    familyId: id, isCurrent: true, archived: false,
    file: { path: `files/${id}/a.pdf`, name: 'a.pdf', size: 10, contentType: 'application/pdf', sha256: SHA },
    originalName: 'a.pdf', createdBy: email, createdAt: serverTimestamp(), updatedBy: email, updatedAt: serverTimestamp(), rev: 1,
    ...over,
  }
}

async function createAs(email: string, id: string, over: Record<string, unknown> = {}, withHistory = true, counterNext: number | null = 101) {
  const db = fs(email)
  const b = writeBatch(db)
  if (counterNext !== null) b.set(doc(db, 'config', 'counter'), { next: counterNext })
  b.set(doc(db, 'documents', id), docFields(email, id, over))
  if (withHistory) b.set(doc(db, 'documents', id, 'history', '1'), { rev: 1, by: email, at: serverTimestamp(), action: 'create', changes: {} })
  return b.commit()
}

async function seedDoc(id: string, over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore() as unknown as Firestore
    const f = docFields('ed@x.org', id, over)
    await setDoc(doc(db, 'documents', id), { ...f, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') })
    await setDoc(doc(db, 'documents', id, 'history', '1'), { rev: 1, by: 'ed@x.org', at: new Date('2026-01-01'), action: 'create', changes: {} })
  })
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ashkolot',
    firestore: { rules: readFileSync(new URL('firebase/firestore.rules', ROOT), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(new URL('firebase/storage.rules', ROOT), 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore() as unknown as Firestore
    await setDoc(doc(db, 'config', 'taxonomy'), { ...tax, keys, updatedBy: 'seed', updatedAt: new Date() })
    await setDoc(doc(db, 'config', 'counter'), { next: 100 })
    for (const [email, role, active] of [
      ['admin@x.org', 'admin', true], ['ed@x.org', 'editor', true], ['view@x.org', 'viewer', true], ['off@x.org', 'editor', false],
    ] as const) await setDoc(doc(db, 'users', email), { role, active, name: '', updatedBy: 'seed', updatedAt: new Date() })
  })
})

describe('access control', () => {
  it('blocks anonymous, unlisted, inactive, unverified and password users', async () => {
    await seedDoc('d1')
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, 'documents', 'd1')))
    await assertFails(getDoc(doc(fs('stranger@x.org'), 'documents', 'd1')))
    await assertFails(getDoc(doc(fs('off@x.org'), 'documents', 'd1')))
    await assertFails(getDoc(doc(fs('ed@x.org', { verified: false }), 'documents', 'd1')))
    await assertFails(getDoc(doc(fs('ed@x.org', { provider: 'password' }), 'documents', 'd1')))
    await assertSucceeds(getDoc(doc(fs('ed@x.org'), 'documents', 'd1')))
  })

  it('viewers cannot see restricted docs, and must filter queries', async () => {
    await seedDoc('open')
    await seedDoc('secret', { restricted: true })
    const v = fs('view@x.org')
    await assertSucceeds(getDoc(doc(v, 'documents', 'open')))
    await assertFails(getDoc(doc(v, 'documents', 'secret')))
    await assertFails(getDocs(collection(v, 'documents')))
    await assertSucceeds(getDocs(query(collection(v, 'documents'), where('restricted', '==', false))))
    await assertSucceeds(getDoc(doc(fs('ed@x.org'), 'documents', 'secret')))
    await assertFails(getDocs(collection(v, 'documents', 'secret', 'history')))
  })
})

describe('documents', () => {
  it('editor can create with history; viewer cannot', async () => {
    await assertSucceeds(createAs('ed@x.org', 'n1'))
    await assertFails(createAs('view@x.org', 'n2'))
  })

  it('rejects create without history, with forged author, bad taxonomy value, extra field or bad file path', async () => {
    await assertFails(createAs('ed@x.org', 'n1', {}, false))
    await assertFails(createAs('ed@x.org', 'n2', { createdBy: 'someone@else.org' }))
    await assertFails(createAs('ed@x.org', 'n3', { folder: '99' }))
    await assertFails(createAs('ed@x.org', 'n4', { forum: ['not-a-forum'] }))
    await assertFails(createAs('ed@x.org', 'n5', { isAdmin: true }))
    await assertFails(createAs('ed@x.org', 'n6', { file: { path: 'files/other/a.pdf', name: 'a.pdf', size: 10, contentType: 'application/pdf', sha256: SHA } }))
    await assertFails(createAs('ed@x.org', 'n7', { folder: '09', meetingDate: null }))
    await assertFails(createAs('ed@x.org', 'n8', { rev: 2 }))
    await assertSucceeds(createAs('ed@x.org', 'n9', { folder: '09', docType: 'summary', meetingDate: '2026-08-05' }))
  })

  it('keeps team outputs and external materials in separate areas', async () => {
    await assertFails(createAs('ed@x.org', 'x1', { folder: '02-1' }))
    await assertFails(createAs('ed@x.org', 'x2', { publisher: 'oecd', status: 'reference' }))
    await assertSucceeds(createAs('ed@x.org', 'x3', { folder: '02-2', publisher: 'oecd', status: 'reference' }))
  })

  it('stable code must equal the counter, and the counter must advance by exactly 1', async () => {
    await assertFails(createAs('ed@x.org', 'c1', { seq: 7 }))
    await assertFails(createAs('ed@x.org', 'c2', {}, true, null))
    await assertFails(createAs('ed@x.org', 'c3', {}, true, 102))
    await assertFails(setDoc(doc(fs('ed@x.org'), 'config', 'counter'), { next: 50 }))
    await assertFails(setDoc(doc(fs('view@x.org'), 'config', 'counter'), { next: 101 }))
    await assertSucceeds(createAs('ed@x.org', 'c4'))
  })

  it('new version must point at an existing family', async () => {
    await assertFails(createAs('ed@x.org', 'v2', { familyId: 'does-not-exist' }))
    await seedDoc('v1')
    await assertSucceeds(createAs('ed@x.org', 'v2', { familyId: 'v1' }))
  })

  it('update requires rev+1 and a matching history entry', async () => {
    await seedDoc('d1')
    const db = fs('ed@x.org')
    const upd = { folder: '05', rev: 2, updatedBy: 'ed@x.org', updatedAt: serverTimestamp() }

    await assertFails(updateDoc(doc(db, 'documents', 'd1'), upd))

    const skip = writeBatch(db)
    skip.update(doc(db, 'documents', 'd1'), { ...upd, rev: 3 })
    skip.set(doc(db, 'documents', 'd1', 'history', '3'), { rev: 3, by: 'ed@x.org', at: serverTimestamp(), action: 'update', changes: {} })
    await assertFails(skip.commit())

    const ok = writeBatch(db)
    ok.update(doc(db, 'documents', 'd1'), upd)
    ok.set(doc(db, 'documents', 'd1', 'history', '2'), { rev: 2, by: 'ed@x.org', at: serverTimestamp(), action: 'update', changes: { folder: { from: '04', to: '05' } } })
    await assertSucceeds(ok.commit())
  })

  it('protects immutable fields; only admin may change the file', async () => {
    await seedDoc('d1')
    const tryUpdate = (email: string, fields: Record<string, unknown>, id = 'd1') => {
      const db = fs(email)
      const b = writeBatch(db)
      b.update(doc(db, 'documents', id), { ...fields, rev: 2, updatedBy: email, updatedAt: serverTimestamp() })
      b.set(doc(db, 'documents', id, 'history', '2'), { rev: 2, by: email, at: serverTimestamp(), action: 'update', changes: {} })
      return b.commit()
    }
    await assertFails(tryUpdate('ed@x.org', { createdBy: 'ed2@x.org' }))
    await assertFails(tryUpdate('ed@x.org', { originalName: 'x.pdf' }))
    await assertFails(tryUpdate('ed@x.org', { seq: 5 }))
    const otherFile = { path: 'files/d1/b.pdf', name: 'b.pdf', size: 20, contentType: 'application/pdf', sha256: SHA }
    await assertFails(tryUpdate('ed@x.org', { file: otherFile }))
    await assertSucceeds(tryUpdate('admin@x.org', { file: otherFile }))
    await seedDoc('d3')
    await assertSucceeds(tryUpdate('ed@x.org', { author: 'KGC' }, 'd3'))
  })

  it('history is append-only and cannot be forged', async () => {
    await seedDoc('d1')
    const db = fs('ed@x.org')
    await assertFails(setDoc(doc(db, 'documents', 'd1', 'history', '1'), { rev: 1, by: 'ed@x.org', at: serverTimestamp(), action: 'update', changes: {} }))
    await assertFails(deleteDoc(doc(db, 'documents', 'd1', 'history', '1')))
    await assertFails(setDoc(doc(db, 'documents', 'd1', 'history', '2'), { rev: 2, by: 'ed@x.org', at: serverTimestamp(), action: 'update', changes: {} }))
    const adminDb = fs('admin@x.org')
    await assertFails(deleteDoc(doc(adminDb, 'documents', 'd1', 'history', '1')))
  })

  it('only admin can delete documents', async () => {
    await seedDoc('d1')
    await assertFails(deleteDoc(doc(fs('ed@x.org'), 'documents', 'd1')))
    await assertSucceeds(deleteDoc(doc(fs('admin@x.org'), 'documents', 'd1')))
  })
})

describe('users & taxonomy', () => {
  const userDoc = (email: string, role: string, active = true) => ({ role, active, name: '', updatedBy: email, updatedAt: serverTimestamp() })

  it('only admins manage users; users can read only themselves', async () => {
    await assertFails(setDoc(doc(fs('ed@x.org'), 'users', 'new@x.org'), userDoc('ed@x.org', 'editor')))
    await assertFails(setDoc(doc(fs('ed@x.org'), 'users', 'ed@x.org'), userDoc('ed@x.org', 'admin')))
    await assertSucceeds(setDoc(doc(fs('admin@x.org'), 'users', 'new@x.org'), userDoc('admin@x.org', 'viewer')))
    await assertFails(setDoc(doc(fs('admin@x.org'), 'users', 'bad@x.org'), userDoc('admin@x.org', 'superuser')))
    await assertFails(setDoc(doc(fs('admin@x.org'), 'users', 'Upper@X.org'), userDoc('admin@x.org', 'viewer')))
    await assertSucceeds(getDoc(doc(fs('view@x.org'), 'users', 'view@x.org')))
    await assertFails(getDoc(doc(fs('view@x.org'), 'users', 'ed@x.org')))
  })

  it('admin cannot lock themselves out', async () => {
    const db = fs('admin@x.org')
    await assertFails(setDoc(doc(db, 'users', 'admin@x.org'), userDoc('admin@x.org', 'editor')))
    await assertFails(deleteDoc(doc(db, 'users', 'admin@x.org')))
  })

  it('taxonomy: admin only, version+1, values can be added but never removed', async () => {
    const write = (email: string, t: Taxonomy, version: number) =>
      setDoc(doc(fs(email), 'config', 'taxonomy'), { ...t, version, keys: computeKeys(t), updatedBy: email, updatedAt: serverTimestamp() })

    const added = structuredClone(tax)
    added.dimensions.topic.values.push({ key: 'housing', label: 'דיור' })
    await assertFails(write('ed@x.org', added, tax.version + 1))
    await assertFails(write('admin@x.org', added, tax.version))
    await assertSucceeds(write('admin@x.org', added, tax.version + 1))

    const removed = structuredClone(added)
    removed.dimensions.topic.values = removed.dimensions.topic.values.filter((v) => v.key !== 'welfare')
    await assertFails(write('admin@x.org', removed, tax.version + 2))
  })

  it('documents using a newly added taxonomy value are accepted', async () => {
    const added = structuredClone(tax)
    added.dimensions.topic.values.push({ key: 'housing', label: 'דיור' })
    await assertFails(createAs('ed@x.org', 'h1', { topic: ['housing'] }))
    await setDoc(doc(fs('admin@x.org'), 'config', 'taxonomy'), { ...added, version: tax.version + 1, keys: computeKeys(added), updatedBy: 'admin@x.org', updatedAt: serverTimestamp() })
    await assertSucceeds(createAs('ed@x.org', 'h2', { topic: ['housing'] }))
  })
})

describe('storage', () => {
  const pdf = new Uint8Array([37, 80, 68, 70])
  const meta = (email: string, contentType = 'application/pdf') => ({ contentType, customMetadata: { uploadedBy: email } })

  it('editor can upload allowed types to a not-yet-created document', async () => {
    const st = ctx('ed@x.org').storage()
    await assertSucceeds(uploadBytes(ref(st, 'files/new1/a.pdf'), pdf, meta('ed@x.org')))
  })

  it('rejects viewers, bad types, forged uploader, other paths and uploads to existing docs', async () => {
    await assertFails(uploadBytes(ref(ctx('view@x.org').storage(), 'files/n2/a.pdf'), pdf, meta('view@x.org')))
    await assertFails(uploadBytes(ref(ctx('ed@x.org').storage(), 'files/n3/a.html'), pdf, meta('ed@x.org', 'text/html')))
    await assertFails(uploadBytes(ref(ctx('ed@x.org').storage(), 'files/n4/a.pdf'), pdf, meta('admin@x.org')))
    await assertFails(uploadBytes(ref(ctx('ed@x.org').storage(), 'other/a.pdf'), pdf, meta('ed@x.org')))
    await seedDoc('existing')
    await assertFails(uploadBytes(ref(ctx('ed@x.org').storage(), 'files/existing/b.pdf'), pdf, meta('ed@x.org')))
  })

  it('viewer cannot download a restricted file', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), 'files/sec/a.pdf'), pdf, { contentType: 'application/pdf' })
      await uploadBytes(ref(c.storage(), 'files/pub/a.pdf'), pdf, { contentType: 'application/pdf' })
    })
    await seedDoc('sec', { restricted: true, file: { path: 'files/sec/a.pdf', name: 'a.pdf', size: 4, contentType: 'application/pdf', sha256: SHA } })
    await seedDoc('pub', { file: { path: 'files/pub/a.pdf', name: 'a.pdf', size: 4, contentType: 'application/pdf', sha256: SHA } })
    await assertFails(getBytes(ref(ctx('view@x.org').storage(), 'files/sec/a.pdf')))
    await assertSucceeds(getBytes(ref(ctx('view@x.org').storage(), 'files/pub/a.pdf')))
    await assertSucceeds(getBytes(ref(ctx('ed@x.org').storage(), 'files/sec/a.pdf')))
    await assertFails(getBytes(ref(ctx('stranger@x.org').storage(), 'files/pub/a.pdf')))
  })
})
