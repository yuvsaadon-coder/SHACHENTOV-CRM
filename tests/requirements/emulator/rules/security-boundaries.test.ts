import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage'
import { EMULATORS, PROJECT_ID } from '../../support/emulator-env'

const RUN_ID = `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
const BUCKET = `${PROJECT_ID}.appspot.com`
const ROLES = ['admin', 'CEO', 'JLM', 'SUP', 'FIN', 'DON', 'DES', 'PUB', 'VOL'] as const
const DOMAIN_ROLES = ROLES.filter((role) => role !== 'admin')

let env: RulesTestEnvironment

function root(...parts: string[]) {
  return [RUN_ID, ...parts].join('-')
}

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}

async function remove(path: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await deleteDoc(doc(ctx.firestore(), path))
  })
}

function db(uid?: string) {
  return uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()
}

function storage(uid?: string) {
  return uid ? env.authenticatedContext(uid).storage(BUCKET) : env.unauthenticatedContext().storage(BUCKET)
}

async function profile(uid: string, role?: string) {
  await seed(`users/${uid}`, {
    name: uid,
    email: `${uid}@requirements.invalid`,
    active: true,
    ...(role === undefined ? {} : { role }),
  })
}

const baseTask = (uid: string, domain = 'JLM') => ({
  domain,
  category: 'security',
  title: root('task-title'),
  steps: '',
  frequency: 'חד-פעמי',
  startDate: null,
  endDate: null,
  holidayAnchor: null,
  involved: [],
  activator: null,
  contactRefs: [],
  status: 'לא בוצע',
  notes: '',
  createdBy: uid,
  updatedBy: uid,
})

async function expectCrudDeniedAsAnonymous(path: string, validReadUid: string, validWriteUid: string, validCreateUid: string) {
  const anonymous = db()
  const authorizedReader = db(validReadUid)
  const authorizedWriter = db(validWriteUid)
  const existing = await assertSucceeds(getDoc(doc(authorizedReader, path)))
  if (!existing.exists()) throw new Error(`Missing positive-control fixture: ${path}`)
  const createPath = `${path}-create-control`
  const anonymousTarget = doc(anonymous, createPath)
  const writerTarget = doc(authorizedWriter, createPath)
  try {
    await assertSucceeds(setDoc(doc(db(validCreateUid), createPath), existing.data()))
    await remove(createPath)
    await assertFails(setDoc(anonymousTarget, existing.data()))
    await assertSucceeds(setDoc(doc(db(validCreateUid), createPath), existing.data()))
    await assertSucceeds(getDoc(doc(authorizedReader, createPath)))
    await assertFails(getDoc(anonymousTarget))
    await assertSucceeds(updateDoc(writerTarget, existing.data()))
    await assertFails(updateDoc(anonymousTarget, existing.data()))
    await assertFails(deleteDoc(anonymousTarget))
    await assertSucceeds(deleteDoc(writerTarget))
  } finally {
    await remove(createPath)
  }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATORS.firestore.host,
      port: EMULATORS.firestore.port,
      rules: readFileSync(join('tests', 'requirements', '.cache', 'firestore.rules'), 'utf8'),
    },
    storage: {
      host: EMULATORS.storage.host,
      port: EMULATORS.storage.port,
      rules: readFileSync(join('tests', 'requirements', '.cache', 'storage.rules'), 'utf8'),
    },
  })

  await Promise.all([
    profile(root('admin'), 'admin'),
    profile(root('hq'), 'JLM'),
    profile(root('fin'), 'FIN'),
    profile(root('coord-a'), 'coordinator'),
    profile(root('coord-b'), 'coordinator'),
    profile(root('no-role')),
    seed(`branches/${root('branch-a')}`, {
      name: 'סניף בדיקות א',
      type: 'food',
      city: 'ירושלים',
      coordinatorUids: [root('coord-a')],
    }),
    seed(`branches/${root('branch-b')}`, {
      name: 'סניף בדיקות ב',
      type: 'food',
      city: 'תל אביב',
      coordinatorUids: [root('coord-b')],
    }),
    seed(`tasks/${root('task')}`, baseTask(root('hq'))),
    seed(`tasks/${root('task')}/comments/${root('comment')}`, { text: 'comment' }),
    seed(`tasks/${root('task')}/attachments/${root('attachment')}`, { fileName: 'proof.txt' }),
    seed(`tasks/${root('task')}/history/${root('history')}`, { field: 'status' }),
    seed(`contacts/${root('contact')}`, { name: 'איש קשר', type: 'מטה', domainTags: ['JLM'] }),
    seed(`roles/${root('role')}`, { roleName: 'תפקיד', level: 'מטה', area: 'JLM' }),
    seed(`reportQuestions/${root('question')}`, {
      branchType: 'food',
      key: root('q'),
      label: 'שאלת בדיקה',
      section: 'כללי',
      type: 'text',
      firstReportOnly: false,
      order: 1,
    }),
    seed(`quarterlyReports/${root('report-a')}`, {
      branchId: root('branch-a'),
      branchType: 'food',
      quarter: 'Q1',
      year: 2026,
      submittedBy: root('coord-a'),
      data: { proof: 'ok' },
    }),
    seed(`quarterlyReports/${root('report-b')}`, {
      branchId: root('branch-b'),
      branchType: 'food',
      quarter: 'Q1',
      year: 2026,
      submittedBy: root('coord-b'),
      data: { proof: 'foreign' },
    }),
    seed(`hq_knowledge/${root('hqk')}`, {
      domain: 'JLM',
      category: 'handover',
      title: 'ידע מטה',
      content: 'תוכן',
      tags: [],
      createdBy: root('admin'),
    }),
    seed(`knowledge_articles/${root('article')}`, {
      titleHe: 'מאמר בדיקה',
      summary: 'סיכום',
      lang: 'he',
    }),
    seed(`knowledgeItems/${root('knowledge-a')}`, {
      branchId: root('branch-a'),
      type: 'document',
      title: 'ידע א',
      content: 'תוכן א',
      tags: [],
      createdBy: root('coord-a'),
    }),
    seed(`knowledgeItems/${root('knowledge-b')}`, {
      branchId: root('branch-b'),
      type: 'document',
      title: 'ידע ב',
      content: 'תוכן ב',
      tags: [],
      createdBy: root('coord-b'),
    }),
    seed(`users/${root('hq')}/personalTasks/${root('private')}`, {
      title: 'פרטי',
      maliciousParentUid: root('admin'),
    }),
    seed(`users/${root('hq')}/chatSessions/${root('chat')}`, {
      title: 'שיחה פרטית',
      messages: [],
    }),
  ])
})

afterAll(async () => {
  await Promise.all([
    remove(`tasks/${root('task')}/comments/${root('comment')}`),
    remove(`tasks/${root('task')}/attachments/${root('attachment')}`),
    remove(`tasks/${root('task')}/history/${root('history')}`),
    remove(`tasks/${root('task')}`),
    remove(`contacts/${root('contact')}`),
    remove(`roles/${root('role')}`),
    remove(`branches/${root('branch-a')}`),
    remove(`branches/${root('branch-b')}`),
    remove(`reportQuestions/${root('question')}`),
    remove(`quarterlyReports/${root('report-a')}`),
    remove(`quarterlyReports/${root('report-b')}`),
    remove(`hq_knowledge/${root('hqk')}`),
    remove(`knowledge_articles/${root('article')}`),
    remove(`knowledgeItems/${root('knowledge-a')}`),
    remove(`knowledgeItems/${root('knowledge-b')}`),
    remove(`users/${root('hq')}/personalTasks/${root('private')}`),
    remove(`users/${root('hq')}/chatSessions/${root('chat')}`),
    ...['admin', 'hq', 'fin', 'coord-a', 'coord-b', 'no-profile', 'no-role'].map((id) => remove(`users/${root(id)}`)),
  ])
  await env.cleanup()
})

describe('TEST-S01 anonymous and invalid-profile Security Rules', () => {
  const anonymousResources = [
    ['tasks', `tasks/${root('task')}`, root('hq'), root('hq')],
    ['task-comments', `tasks/${root('task')}/comments/${root('comment')}`, root('hq'), root('hq')],
    ['task-attachments', `tasks/${root('task')}/attachments/${root('attachment')}`, root('hq'), root('hq')],
    ['task-history', `tasks/${root('task')}/history/${root('history')}`, root('hq'), root('hq')],
    ['contacts', `contacts/${root('contact')}`, root('hq'), root('hq')],
    ['roles', `roles/${root('role')}`, root('hq'), root('hq')],
    ['branches', `branches/${root('branch-a')}`, root('coord-a'), root('admin')],
    ['reportQuestions', `reportQuestions/${root('question')}`, root('coord-a'), root('admin')],
    ['quarterlyReports', `quarterlyReports/${root('report-a')}`, root('coord-a'), root('admin')],
    ['hq_knowledge', `hq_knowledge/${root('hqk')}`, root('hq'), root('admin')],
    ['knowledge_articles', `knowledge_articles/${root('article')}`, root('coord-a'), root('admin')],
    ['knowledgeItems', `knowledgeItems/${root('knowledge-a')}`, root('coord-a'), root('coord-a')],
    ['personalTasks', `users/${root('hq')}/personalTasks/${root('private')}`, root('hq'), root('hq')],
    ['chatSessions', `users/${root('hq')}/chatSessions/${root('chat')}`, root('hq'), root('hq')],
  ] as const

  it.each(anonymousResources)('TEST-S01.anonymous.%s.crud denies anonymous with positive controls', async (_name, path, reader, writer) => {
    await expectCrudDeniedAsAnonymous(path, reader, writer, _name === 'quarterlyReports' ? reader : writer)
  })

  const anonymousListResources = [
    ['tasks', 'tasks', root('hq')],
    ['contacts', 'contacts', root('hq')],
    ['roles', 'roles', root('hq')],
    ['branches', 'branches', root('coord-a')],
    ['reportQuestions', 'reportQuestions', root('coord-a')],
    ['quarterlyReports', 'quarterlyReports', root('coord-a')],
    ['hq_knowledge', 'hq_knowledge', root('hq')],
    ['knowledge_articles', 'knowledge_articles', root('coord-a')],
    ['knowledgeItems', 'knowledgeItems', root('coord-a')],
    ['personalTasks', `users/${root('hq')}/personalTasks`, root('hq')],
    ['chatSessions', `users/${root('hq')}/chatSessions`, root('hq')],
  ] as const

  it.each(anonymousListResources)('TEST-S01.anonymous.%s.list denies anonymous list with positive control', async (_name, collectionPath, reader) => {
    const authedCollection = collection(db(reader), collectionPath)
    const anonymousCollection = collection(db(), collectionPath)
    if (_name === 'branches') {
      await assertSucceeds(getDocs(query(authedCollection, where('coordinatorUids', 'array-contains', reader))))
      await assertFails(getDocs(query(anonymousCollection, where('coordinatorUids', 'array-contains', reader))))
    } else if (_name === 'knowledgeItems') {
      await assertSucceeds(getDocs(query(authedCollection, where('branchId', 'in', [root('branch-a'), 'global']))))
      await assertFails(getDocs(query(anonymousCollection, where('branchId', 'in', [root('branch-a'), 'global']))))
    } else if (_name === 'quarterlyReports') {
      await assertSucceeds(getDocs(query(authedCollection, where('branchId', '==', root('branch-a')))))
      await assertFails(getDocs(query(anonymousCollection, where('branchId', '==', root('branch-a')))))
    } else {
      await assertSucceeds(getDocs(authedCollection))
      await assertFails(getDocs(anonymousCollection))
    }
  })

  it.each(['branches', 'knowledgeItems', 'knowledge_articles', 'reportQuestions'] as const)(
    'TEST-S01.no-profile-read.%s denies app-data reads to authenticated identity without users profile',
    async (resource) => {
      const noProfileDb = db(root('no-profile'))
      const pathByResource = {
        branches: `branches/${root('branch-a')}`,
        knowledgeItems: `knowledgeItems/${root('knowledge-a')}`,
        knowledge_articles: `knowledge_articles/${root('article')}`,
        reportQuestions: `reportQuestions/${root('question')}`,
      }
      await assertSucceeds(getDoc(doc(db(root('coord-a')), pathByResource[resource])))
      await assertFails(getDoc(doc(noProfileDb, pathByResource[resource])))
    }
  )

  it.each(['branches', 'knowledgeItems', 'knowledge_articles', 'reportQuestions'] as const)(
    'TEST-S01.missing-role-read.%s denies app-data reads to profile with no role',
    async (resource) => {
      const noRoleDb = db(root('no-role'))
      const pathByResource = {
        branches: `branches/${root('branch-a')}`,
        knowledgeItems: `knowledgeItems/${root('knowledge-a')}`,
        knowledge_articles: `knowledge_articles/${root('article')}`,
        reportQuestions: `reportQuestions/${root('question')}`,
      }
      await assertSucceeds(getDoc(doc(db(root('coord-a')), pathByResource[resource])))
      await assertFails(getDoc(doc(noRoleDb, pathByResource[resource])))
    }
  )
})

describe('TEST-S02 HQ role matrices', () => {
  it.each(ROLES)('TEST-S02.valid-hq.%s permits base CRM reads and writes', async (role) => {
    const uid = root(`role-${role}`)
    await profile(uid, role)
    const roleDb = db(uid)
    const taskId = root(`s02-task-${role}`)
    await assertSucceeds(setDoc(doc(roleDb, `tasks/${taskId}`), baseTask(uid, role === 'admin' ? 'CEO' : role)))
    await assertSucceeds(getDoc(doc(roleDb, `tasks/${root('task')}`)))
    await assertSucceeds(getDoc(doc(roleDb, `contacts/${root('contact')}`)))
    await assertSucceeds(getDoc(doc(roleDb, `roles/${root('role')}`)))
    await remove(`tasks/${taskId}`)
    await remove(`users/${uid}`)
  })

  it.each(DOMAIN_ROLES)('TEST-S02.cross-domain-current.%s characterizes current cross-domain task read', async (role) => {
    const uid = root(`cross-${role}`)
    await profile(uid, role)
    await assertSucceeds(getDoc(doc(db(uid), `tasks/${root('task')}`)))
    await remove(`users/${uid}`)
  })
})

describe('TEST-S03 coordinator branch and knowledge boundaries', () => {
  it('TEST-S03.own-branch-query positive control permits own branch query', async () => {
    const snap = await assertSucceeds(getDocs(query(
      collection(db(root('coord-a')), 'branches'),
      where('coordinatorUids', 'array-contains', root('coord-a')),
    )))
    expect(snap.docs.map((d) => d.id)).toContain(root('branch-a'))
  })

  it('TEST-S03.foreign-branch-read denies coordinator reading foreign branch document', async () => {
    await assertSucceeds(getDoc(doc(db(root('coord-a')), `branches/${root('branch-a')}`)))
    await assertFails(getDoc(doc(db(root('coord-a')), `branches/${root('branch-b')}`)))
  })

  it('TEST-S03.foreign-knowledge-read denies coordinator reading another branch knowledge item', async () => {
    await assertSucceeds(getDoc(doc(db(root('coord-a')), `knowledgeItems/${root('knowledge-a')}`)))
    await assertFails(getDoc(doc(db(root('coord-a')), `knowledgeItems/${root('knowledge-b')}`)))
  })

  it('TEST-S03.foreign-knowledge-mutation denies changing own item into another branch', async () => {
    await assertSucceeds(setDoc(doc(db(root('coord-a')), `knowledgeItems/${root('knowledge-a-mutate')}`), {
      branchId: root('branch-a'),
      type: 'document',
      title: 'own',
      content: 'own',
      tags: [],
      createdBy: root('coord-a'),
    }))
    await assertFails(updateDoc(doc(db(root('coord-a')), `knowledgeItems/${root('knowledge-a-mutate')}`), { branchId: root('branch-b') }))
    await remove(`knowledgeItems/${root('knowledge-a-mutate')}`)
  })
})

describe('TEST-S04 quarterly report boundaries', () => {
  it('TEST-S04.own-create-and-read allows coordinator own report create/read with authorized query control', async () => {
    const reportId = root('s04-own')
    await assertSucceeds(setDoc(doc(db(root('coord-a')), `quarterlyReports/${reportId}`), {
      branchId: root('branch-a'),
      branchType: 'food',
      quarter: 'Q2',
      year: 2026,
      submittedBy: root('coord-a'),
      data: { answer: 'own' },
    }))
    await assertSucceeds(getDoc(doc(db(root('coord-a')), `quarterlyReports/${reportId}`)))
    const snap = await assertSucceeds(getDocs(query(
      collection(db(root('coord-a')), 'quarterlyReports'),
      where('branchId', '==', root('branch-a')),
    )))
    expect(snap.docs.some((d) => d.id === reportId)).toBe(true)
    await remove(`quarterlyReports/${reportId}`)
  })

  it('TEST-S04.forged-submitter denies coordinator report with mismatched submittedBy', async () => {
    await assertFails(setDoc(doc(db(root('coord-a')), `quarterlyReports/${root('s04-forged-submitter')}`), {
      branchId: root('branch-a'),
      branchType: 'food',
      quarter: 'Q2',
      year: 2026,
      submittedBy: root('coord-b'),
      data: {},
    }))
  })

  it('TEST-S04.foreign-branch denies coordinator creating or reading foreign report', async () => {
    await assertFails(setDoc(doc(db(root('coord-a')), `quarterlyReports/${root('s04-foreign')}`), {
      branchId: root('branch-b'),
      branchType: 'food',
      quarter: 'Q2',
      year: 2026,
      submittedBy: root('coord-a'),
      data: {},
    }))
    await assertFails(getDoc(doc(db(root('coord-a')), `quarterlyReports/${root('report-b')}`)))
  })

  it('TEST-S04.coordinator-update-delete denies coordinator update/delete', async () => {
    await assertSucceeds(getDoc(doc(db(root('coord-a')), `quarterlyReports/${root('report-a')}`)))
    await assertFails(updateDoc(doc(db(root('coord-a')), `quarterlyReports/${root('report-a')}`), { quarter: 'Q2' }))
    await assertFails(deleteDoc(doc(db(root('coord-a')), `quarterlyReports/${root('report-a')}`)))
  })

  it('TEST-S04.admin-update-delete permits admin update/delete control', async () => {
    const reportId = root('s04-admin')
    await seed(`quarterlyReports/${reportId}`, {
      branchId: root('branch-a'),
      branchType: 'food',
      quarter: 'Q2',
      year: 2026,
      submittedBy: root('coord-a'),
      data: {},
    })
    await assertSucceeds(updateDoc(doc(db(root('admin')), `quarterlyReports/${reportId}`), { year: 2027 }))
    await assertSucceeds(deleteDoc(doc(db(root('admin')), `quarterlyReports/${reportId}`)))
  })
})

describe('TEST-S05 admin-only Firestore writes', () => {
  it.each(['users', 'branches', 'reportQuestions', 'hq_knowledge', 'knowledge_articles'] as const)(
    'TEST-S05.admin-only-write.%s permits admin and denies non-admin HQ',
    async (collectionName) => {
      const id = root(`s05-${collectionName}`)
      const dataByCollection: Record<string, Record<string, unknown>> = {
        users: { role: 'JLM', active: true },
        branches: { name: 'סניף חדש', type: 'food', city: 'בדיקה', coordinatorUids: [] },
        reportQuestions: { branchType: 'food', key: id, label: 'שאלה', section: 'כללי', type: 'text', firstReportOnly: false, order: 1 },
        hq_knowledge: { domain: 'JLM', category: 'handover', title: 'ידע', content: 'תוכן', tags: [], createdBy: root('admin') },
        knowledge_articles: { titleHe: 'מאמר', summary: 'סיכום', lang: 'he' },
      }
      await assertFails(setDoc(doc(db(root('hq')), `${collectionName}/${id}`), dataByCollection[collectionName]))
      await assertSucceeds(setDoc(doc(db(root('admin')), `${collectionName}/${id}`), dataByCollection[collectionName]))
      await assertFails(updateDoc(doc(db(root('hq')), `${collectionName}/${id}`), { touched: true }))
      await assertFails(deleteDoc(doc(db(root('hq')), `${collectionName}/${id}`)))
      await assertSucceeds(deleteDoc(doc(db(root('admin')), `${collectionName}/${id}`)))
    }
  )
})

describe('TEST-S06 Storage exact prefix boundaries', () => {
  it.each(['hq_knowledge/item-a/proof.txt', 'knowledge_articles/article-a/proof.txt'] as const)(
    'TEST-S06.positive.%s permits authenticated exact-prefix upload/read',
    async (path) => {
      const file = ref(storage(root('admin')), `${path.replace('/item-a/', `/${RUN_ID}-item-a/`).replace('/article-a/', `/${RUN_ID}-article-a/`)}`)
      await assertSucceeds(uploadBytes(file, new Blob(['proof'], { type: 'text/plain' })))
      const bytes = await assertSucceeds(getBytes(file))
      expect(new TextDecoder().decode(bytes)).toBe('proof')
      await assertSucceeds(deleteObject(file))
    }
  )

  it.each(['hq_knowledge/item-a/proof.txt', 'knowledge_articles/article-a/proof.txt'] as const)(
    'TEST-S06.anonymous.%s denies anonymous access after positive control',
    async (path) => {
      const objectPath = path.replace('/item-a/', `/${RUN_ID}-item-a/`).replace('/article-a/', `/${RUN_ID}-article-a/`)
      const authed = ref(storage(root('admin')), objectPath)
      const anonymous = ref(storage(), objectPath)
      await assertSucceeds(uploadBytes(authed, new Blob(['proof'])))
      await assertFails(getBytes(anonymous))
      await assertFails(uploadBytes(anonymous, new Blob(['denied'])))
      await assertSucceeds(deleteObject(authed))
    }
  )

  it.each(['hq_knowledge/item-a/proof.txt', 'knowledge_articles/article-a/proof.txt'] as const)(
    'TEST-S06.foreign-overwrite.%s denies unrelated coordinator overwrite',
    async (path) => {
      const objectPath = path.replace('/item-a/', `/${RUN_ID}-item-a/`).replace('/article-a/', `/${RUN_ID}-article-a/`)
      const adminFile = ref(storage(root('admin')), objectPath)
      const coordFile = ref(storage(root('coord-b')), objectPath)
      await assertSucceeds(uploadBytes(adminFile, new Blob(['proof'])))
      await assertFails(uploadBytes(coordFile, new Blob(['overwrite'])))
      await assertSucceeds(deleteObject(adminFile))
    }
  )

  it.each(['hq_knowledge/item-a/proof.txt', 'knowledge_articles/article-a/proof.txt'] as const)(
    'TEST-S06.foreign-delete.%s denies unrelated coordinator delete',
    async (path) => {
      const objectPath = path.replace('/item-a/', `/${RUN_ID}-item-a/`).replace('/article-a/', `/${RUN_ID}-article-a/`)
      const adminFile = ref(storage(root('admin')), objectPath)
      const coordFile = ref(storage(root('coord-b')), objectPath)
      await assertSucceeds(uploadBytes(adminFile, new Blob(['proof'])))
      await assertFails(deleteObject(coordFile))
      await assertSucceeds(deleteObject(adminFile))
    }
  )
})

describe('TEST-S07 private user subcollection boundaries', () => {
  it.each(['personalTasks', 'chatSessions'] as const)(
    'TEST-S07.owner-only.%s allows owner and denies other users including admin',
    async (subcollection) => {
      const path = `users/${root('hq')}/${subcollection}/${subcollection === 'personalTasks' ? root('private') : root('chat')}`
      await assertSucceeds(getDoc(doc(db(root('hq')), path)))
      await assertFails(getDoc(doc(db(root('fin')), path)))
      await assertFails(getDoc(doc(db(root('admin')), path)))
      await assertSucceeds(setDoc(doc(db(root('hq')), `users/${root('hq')}/${subcollection}/${root(`own-${subcollection}`)}`), {
        title: 'owner write',
        maliciousParentUid: root('admin'),
      }))
      await assertFails(setDoc(doc(db(root('admin')), `users/${root('hq')}/${subcollection}/${root(`admin-${subcollection}`)}`), {
        title: 'foreign write',
        maliciousParentUid: root('admin'),
      }))
      await remove(`users/${root('hq')}/${subcollection}/${root(`own-${subcollection}`)}`)
    }
  )

  it.each([
    ['other-hq', root('fin')],
    ['admin', root('admin')],
    ['coordinator', root('coord-a')],
  ] as const)('TEST-S07.foreign-list.%s.personalTasks denies foreign authenticated list', async (_roleName, foreignUid) => {
    await assertSucceeds(getDocs(collection(db(root('hq')), `users/${root('hq')}/personalTasks`)))
    await assertFails(getDocs(collection(db(foreignUid), `users/${root('hq')}/personalTasks`)))
  })

  it.each([
    ['other-hq', root('fin')],
    ['admin', root('admin')],
    ['coordinator', root('coord-a')],
  ] as const)('TEST-S07.foreign-list.%s.chatSessions denies foreign authenticated list', async (_roleName, foreignUid) => {
    await assertSucceeds(getDocs(collection(db(root('hq')), `users/${root('hq')}/chatSessions`)))
    await assertFails(getDocs(collection(db(foreignUid), `users/${root('hq')}/chatSessions`)))
  })

  it.each([
    ['other-hq', root('fin')],
    ['admin', root('admin')],
    ['coordinator', root('coord-a')],
  ] as const)('TEST-S07.foreign-update.%s.personalTasks denies foreign authenticated update', async (_roleName, foreignUid) => {
    const path = `users/${root('hq')}/personalTasks/${root('private')}`
    const controlPath = `users/${root('hq')}/personalTasks/${root(`owner-update-control-${_roleName}`)}`
    await seed(controlPath, { title: 'owner update control' })
    await assertSucceeds(updateDoc(doc(db(root('hq')), controlPath), { title: 'owner updated' }))
    await assertFails(updateDoc(doc(db(foreignUid), path), { title: 'foreign updated' }))
    await remove(controlPath)
  })

  it.each([
    ['other-hq', root('fin')],
    ['admin', root('admin')],
    ['coordinator', root('coord-a')],
  ] as const)('TEST-S07.foreign-update.%s.chatSessions denies foreign authenticated update', async (_roleName, foreignUid) => {
    const path = `users/${root('hq')}/chatSessions/${root('chat')}`
    const controlPath = `users/${root('hq')}/chatSessions/${root(`owner-update-chat-control-${_roleName}`)}`
    await seed(controlPath, { title: 'owner update control', messages: [] })
    await assertSucceeds(updateDoc(doc(db(root('hq')), controlPath), { title: 'owner updated' }))
    await assertFails(updateDoc(doc(db(foreignUid), path), { title: 'foreign updated' }))
    await remove(controlPath)
  })

  it.each([
    ['other-hq', root('fin')],
    ['admin', root('admin')],
    ['coordinator', root('coord-a')],
  ] as const)('TEST-S07.foreign-delete.%s.personalTasks denies foreign authenticated delete', async (_roleName, foreignUid) => {
    const targetPath = `users/${root('hq')}/personalTasks/${root(`foreign-delete-target-${_roleName}`)}`
    const controlPath = `users/${root('hq')}/personalTasks/${root(`owner-delete-control-${_roleName}`)}`
    await seed(targetPath, { title: 'foreign delete target' })
    await seed(controlPath, { title: 'owner delete control' })
    await assertSucceeds(deleteDoc(doc(db(root('hq')), controlPath)))
    await assertFails(deleteDoc(doc(db(foreignUid), targetPath)))
    await remove(targetPath)
  })

  it.each([
    ['other-hq', root('fin')],
    ['admin', root('admin')],
    ['coordinator', root('coord-a')],
  ] as const)('TEST-S07.foreign-delete.%s.chatSessions denies foreign authenticated delete', async (_roleName, foreignUid) => {
    const targetPath = `users/${root('hq')}/chatSessions/${root(`foreign-delete-chat-target-${_roleName}`)}`
    const controlPath = `users/${root('hq')}/chatSessions/${root(`owner-delete-chat-control-${_roleName}`)}`
    await seed(targetPath, { title: 'foreign delete target', messages: [] })
    await seed(controlPath, { title: 'owner delete control', messages: [] })
    await assertSucceeds(deleteDoc(doc(db(root('hq')), controlPath)))
    await assertFails(deleteDoc(doc(db(foreignUid), targetPath)))
    await remove(targetPath)
  })
})

describe('TEST-S08 direct-body authority boundaries', () => {
  it('TEST-S08.self-role-escalation denies own users document self-promotion', async () => {
    await assertSucceeds(getDoc(doc(db(root('hq')), `users/${root('hq')}`)))
    await assertFails(updateDoc(doc(db(root('hq')), `users/${root('hq')}`), { role: 'admin' }))
  })

  it('TEST-S08.forged-report-owner denies mismatched submittedBy body', async () => {
    await assertFails(setDoc(doc(db(root('coord-a')), `quarterlyReports/${root('s08-forged-owner')}`), {
      branchId: root('branch-a'),
      branchType: 'food',
      quarter: 'Q3',
      year: 2026,
      submittedBy: root('admin'),
      data: {},
    }))
  })

  it('TEST-S08.current-authorized-body-validation characterizes current authorized malformed task body', async () => {
    await assertSucceeds(setDoc(doc(db(root('hq')), `tasks/${root('s08-malformed-task')}`), {
      arbitrary: true,
      nested: { unexpected: 'value' },
      domain: 123,
    }))
    await remove(`tasks/${root('s08-malformed-task')}`)
  })
})
