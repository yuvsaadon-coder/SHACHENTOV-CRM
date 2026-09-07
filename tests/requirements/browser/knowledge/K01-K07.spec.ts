import { test, expect, type Page } from '@playwright/test'
import { adminDb } from '../../support/knowledge-admin'
import { FIXTURE } from '../../support/knowledge-fixtures'
import { coordinatorContext } from '../../support/knowledge-chat-context'
import {
  prepareKnowledge, cleanupKnowledge, showKnowledge, signInKnowledge, addHQ,
  addResearch, hqInput, storageFiles, conflictNextWrite,
} from '../../support/knowledge-browser'

test.beforeEach(async ({ page }) => { await prepareKnowledge(page) })
test.afterEach(async ({ page }, info) => { await cleanupKnowledge(page, info) })

test('TEST-K01.explicit-filters-and-edit (A)', async ({ page }) => {
  const target = await addHQ(page, { ...hqInput, title: 'שרשרת כספים', tags: ['תגייחודי'] })
  await addHQ(page, { ...hqInput, title: 'פריט כללי', domain: 'all', category: 'procedures', tags: ['כללי'] })
  await addHQ(page, { ...hqInput, title: 'פריט מתנדבים', domain: 'VOL' })
  await addHQ(page, { ...hqInput, title: 'פריט משותף', visibleToCoordinators: true })
  await showKnowledge(page, 'hq')
  await page.getByRole('button', { name: 'כספים', exact: true }).click()
  await expect(page.getByText('שרשרת כספים', { exact: true })).toBeVisible()
  await expect(page.getByText('פריט כללי', { exact: true })).toBeVisible()
  await expect(page.getByText('פריט מתנדבים', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: '💡 טיפים ועצות', exact: true }).click()
  await expect(page.getByText('פריט כללי', { exact: true })).toBeHidden()
  await page.getByPlaceholder('חיפוש...').fill('תגייחודי')
  await expect(page.getByText('שרשרת כספים', { exact: true })).toBeVisible()
  await page.getByPlaceholder('חיפוש...').fill('לאקיים')
  await expect(page.getByText('שרשרת כספים', { exact: true })).toBeHidden()
  await page.getByPlaceholder('חיפוש...').fill('תוכן מטה')
  await expect(page.getByText('שרשרת כספים', { exact: true })).toBeVisible()
  await page.evaluate(({ id, input }) => window.knowledgeDriver.updateHQ(id, input), {
    id: target.id, input: { ...hqInput, title: 'גרסה מעודכנת', tags: ['תגחדש'] },
  })
  await expect(page.getByText('גרסה מעודכנת', { exact: true })).toBeVisible()
  const stored = (await target.ref.get()).data()
  expect(stored).toMatchObject({ title: 'גרסה מעודכנת', tags: ['תגחדש'], createdBy: FIXTURE.admin.name })
  await page.getByPlaceholder('חיפוש...').fill('')
  await page.getByRole('button', { name: '🔗 משותף לרכזים', exact: true }).click()
  await expect(page.getByText('פריט משותף', { exact: true })).toBeVisible()
  await expect(page.getByText('גרסה מעודכנת', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: '🔒 מטה בלבד', exact: true }).click()
  await expect(page.getByText('פריט משותף', { exact: true })).toBeHidden()
  await signInKnowledge(page, FIXTURE.hq.uid)
  await expect(page.getByText('גרסה מעודכנת', { exact: true })).toBeVisible()
})

test('TEST-K01.domain-default (G)', async ({ page }) => {
  await addHQ(page, { ...hqInput, title: 'פריט כספים' })
  await addHQ(page, { ...hqInput, title: 'פריט כללי', domain: 'all' })
  await addHQ(page, { ...hqInput, title: 'פריט מתנדבים', domain: 'VOL' })
  await signInKnowledge(page, FIXTURE.hq.uid)
  await showKnowledge(page, 'hq')
  await expect(page.getByText('פריט כספים', { exact: true })).toBeVisible()
  await expect(page.getByText('פריט כללי', { exact: true })).toBeVisible()
  await expect(page.getByText('פריט מתנדבים', { exact: true })).toBeHidden()
})

test('TEST-K02.local-create-with-sparse-fields (G)', async ({ page }) => {
  await signInKnowledge(page, FIXTURE.coordA.uid)
  await showKnowledge(page, 'portal')
  await page.getByRole('button', { name: '+ הוסף', exact: true }).click()
  await page.getByRole('button', { name: /לינק/ }).click()
  await page.getByPlaceholder('כותרת הפריט').fill('קישור לתיאום מקומי')
  await page.getByPlaceholder('https://...').fill('https://example.invalid/synthetic-guide')
  await page.getByRole('button', { name: 'שמור', exact: true }).click()
  // A valid modal submission must succeed. Undefined optional fields are the
  // producer's responsibility; the test never strips them before the write.
  await expect(page.getByText('הוסף לידע הסניף', { exact: true })).toBeHidden()
  const docs = await adminDb().collection('knowledgeItems').where('title', '==', 'קישור לתיאום מקומי').get()
  expect(docs.size).toBe(1)
  expect(docs.docs[0].data()).toMatchObject({
    branchId: FIXTURE.branchA.id, type: 'link', url: 'https://example.invalid/synthetic-guide',
    tags: [], createdBy: FIXTURE.coordA.uid,
  })
})

test('TEST-K02.local-create-valid-nonempty-checklist (A)', async ({ page }) => {
  await signInKnowledge(page, FIXTURE.coordA.uid)
  await page.evaluate((branchId) => window.knowledgeDriver.addLocal({
    branchId, type: 'checklist', title: 'רשימת פתיחה שבועית', content: '',
    checklistItems: ['בדיקת מלאי', 'אימות נהגים'], tags: ['לוגיסטיקה'],
  }), FIXTURE.branchA.id)
  await showKnowledge(page, 'portal')
  await page.getByRole('button', { name: /רשימת פתיחה שבועית/ }).click()
  await expect(page.getByLabel('בדיקת מלאי')).toBeVisible()
  await page.getByLabel('בדיקת מלאי').check()
  await expect(page.getByLabel('בדיקת מלאי')).toBeChecked()
  const docs = await adminDb().collection('knowledgeItems').where('title', '==', 'רשימת פתיחה שבועית').get()
  expect(docs.size).toBe(1)
  expect(docs.docs[0].data()).toMatchObject({
    checklistItems: ['בדיקת מלאי', 'אימות נהגים'], tags: ['לוגיסטיקה'], createdBy: FIXTURE.coordA.uid,
  })
})

for (const type of ['document', 'checklist'] as const) {
  test(`TEST-K02.local-create-${type}-modal (G)`, async ({ page }) => {
    await signInKnowledge(page, FIXTURE.coordA.uid)
    await showKnowledge(page, 'portal')
    await page.getByRole('button', { name: '+ הוסף', exact: true }).click()
    await page.getByRole('button', { name: type === 'document' ? /מסמך.*טקסט חופשי/ : /רשימת משימות/ }).click()
    await page.getByPlaceholder('כותרת הפריט').fill(`יצירת ${type} מקומי`)
    if (type === 'document') await page.locator('main textarea').fill('תוכן עבודה מקומי')
    else {
      await page.getByPlaceholder('סעיף 1').fill('בדיקת מלאי')
      await page.getByRole('button', { name: '+ הוסף סעיף', exact: true }).click()
      await page.getByPlaceholder('סעיף 2').fill('תיאום מתנדבים')
    }
    await page.getByRole('button', { name: 'שמור', exact: true }).click()
    await expect(page.getByText('הוסף לידע הסניף', { exact: true })).toBeHidden()
    const docs = await adminDb().collection('knowledgeItems').where('title', '==', `יצירת ${type} מקומי`).get()
    expect(docs.size).toBe(1)
    expect(docs.docs[0].data()).toMatchObject({ type, createdBy: FIXTURE.coordA.uid, branchId: FIXTURE.branchA.id })
    if (type === 'checklist') expect(docs.docs[0].data().checklistItems).toEqual(['בדיקת מלאי', 'תיאום מתנדבים'])
    else expect(docs.docs[0].data().content).toBe('תוכן עבודה מקומי')
  })
}

test('TEST-K03.hq-storage-success (A)', async ({ page, request }) => {
  const saved = await addHQ(page, hqInput, { name: 'proof.pdf', content: '%PDF-1.4\nSYNTHETIC_K03_FILE' })
  const data = saved.data()
  expect(data.createdBy).toBe(FIXTURE.admin.name)
  expect(data.fileName).toBe('proof.pdf')
  expect(data.fileUrl).toMatch(/^http:\/\/127\.0\.0\.1:9297\//)
  expect(await storageFiles()).toEqual([`hq_knowledge/${saved.id}/proof.pdf`])
  const response = await request.get(data.fileUrl as string)
  expect(response.ok()).toBe(true)
  expect(await response.text()).toContain('SYNTHETIC_K03_FILE')
})

test('TEST-K03.local-storage-contract (G)', async ({ page }) => {
  await signInKnowledge(page, FIXTURE.coordA.uid)
  await showKnowledge(page, 'portal')
  await page.getByRole('button', { name: '+ הוסף', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'branch.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nBRANCH_FILE'),
  })
  await page.getByRole('button', { name: 'שמור', exact: true }).click()
  await expect(page.getByText('הוסף לידע הסניף', { exact: true })).toBeHidden()
  const docs = await adminDb().collection('knowledgeItems').where('title', '==', 'branch').get()
  expect(docs.size).toBe(1)
  expect(docs.docs[0].data().fileUrl).toMatch(/^http:\/\/127\.0\.0\.1:9297\//)
  expect(await storageFiles()).toHaveLength(1)
})

test('TEST-K03.partial-upload-recovery (G)', async ({ page }, info) => {
  const failure = await conflictNextWrite(page,
    (path, fields) => path.includes('/hq_knowledge/') && 'fileUrl' in fields,
    async () => ({
      documents: (await adminDb().collection('hq_knowledge').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      files: await storageFiles(),
    }),
  )
  const outcome = await page.evaluate(async (input) => {
    try {
      await window.knowledgeDriver.addHQ({ ...input, file: new File(['%PDF-1.4\nRECOVERY'], 'recovery.pdf') })
      return 'saved'
    } catch (error) { return String(error) }
  }, hqInput)
  expect(failure.injected).toBe(1)
  expect(failure.committedBeforeFailure).toMatchObject({
    documents: [expect.objectContaining({ title: hqInput.title, createdBy: FIXTURE.admin.name })],
    files: [expect.stringMatching(/^hq_knowledge\/[^/]+\/recovery\.pdf$/)],
  })
  expect(outcome).toMatch(/failed-precondition|precondition/i)
  await info.attach('fault-evidence', { body: JSON.stringify({ failure, outcome }), contentType: 'application/json' })
  // The failed call must not leave accessible orphaned or falsely complete data.
  const docs = await adminDb().collection('hq_knowledge').get()
  const files = await storageFiles()
  expect(docs.docs.every((doc) => typeof doc.data().fileUrl === 'string') || (docs.empty && files.length === 0)).toBe(true)
})

test('TEST-K03.current-size-boundaries (C)', async ({ page }) => {
  await signInKnowledge(page, FIXTURE.coordA.uid)
  await showKnowledge(page, 'portal')
  await page.getByRole('button', { name: '+ הוסף', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'edge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(500 * 1024 + 1),
  })
  await page.getByRole('button', { name: 'שמור', exact: true }).click()
  await expect(page.getByText(/קובץ גדול מדי .*מקסימום 500 KB/)).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({
    name: 'edge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(500 * 1024),
  })
  await page.getByRole('button', { name: 'שמור', exact: true }).click()
  await expect(page.getByText('שגיאה בשמירה — בדוק חיבור ורשאיות Firebase')).toBeVisible()
  await expect(page.getByText(/קובץ גדול מדי/)).toBeHidden()
  // This characterizes the UI size check only, NOT successful persistence.
  expect((await adminDb().collection('knowledgeItems').get()).empty).toBe(true)
})

test('TEST-K04.produced-mirror-tag-filter (G)', async ({ page }) => {
  await addHQ(page, { ...hqInput, visibleToCoordinators: true })
  await signInKnowledge(page, FIXTURE.coordA.uid)
  await showKnowledge(page, 'portal')
  await page.getByRole('button', { name: /כלל-ארגוני/ }).click()
  // The real mirror must be renderable before its tag filter can be used.
  await expect(page.getByText(hqInput.title, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'לוגיסטיקה', exact: true }).click()
  await expect(page.getByText(hqInput.title, { exact: true })).toBeVisible()
})

test('TEST-K04.unshare-current-retrieval (G)', async ({ page }) => {
  const source = await addHQ(page, { ...hqInput, visibleToCoordinators: true })
  expect((await adminDb().collection('knowledgeItems').doc(`hq-${source.id}`).get()).exists).toBe(true)
  expect(await coordinatorContext(FIXTURE.coordA.uid, FIXTURE.branchA.id)).toContain(hqInput.title)
  await page.evaluate(({ id, input }) => window.knowledgeDriver.updateHQ(id, input), { id: source.id, input: hqInput })
  expect((await adminDb().collection('knowledgeItems').doc(`hq-${source.id}`).get()).exists).toBe(false)
  expect(await coordinatorContext(FIXTURE.coordA.uid, FIXTURE.branchA.id)).not.toContain(hqInput.title)
  await signInKnowledge(page, FIXTURE.coordA.uid)
  await showKnowledge(page, 'portal')
  await page.getByRole('button', { name: /כלל-ארגוני/ }).click()
  await expect(page.getByText(hqInput.title, { exact: true })).toBeHidden()
  await expect(page.getByTestId('consumer-error')).toHaveCount(0)
})

test('TEST-K04.delete-current-retrieval (G)', async ({ page }, info) => {
  const source = await addHQ(page, { ...hqInput, visibleToCoordinators: true })
  expect(await coordinatorContext(FIXTURE.coordA.uid, FIXTURE.branchA.id)).toContain(hqInput.title)
  await page.evaluate((id) => window.knowledgeDriver.deleteHQ(id), source.id)
  expect((await source.ref.get()).exists).toBe(false)
  const context = await coordinatorContext(FIXTURE.coordA.uid, FIXTURE.branchA.id)
  await info.attach('current-provider-context', { body: context, contentType: 'text/plain' })
  expect.soft(context).not.toContain(hqInput.title)
  expect((await adminDb().collection('knowledgeItems').doc(`hq-${source.id}`).get()).exists).toBe(false)
})

test('TEST-K04.old-bearer-url-current (C)', async ({ page, request }) => {
  const source = await addHQ(page, { ...hqInput, visibleToCoordinators: true },
    { name: 'shared.pdf', content: '%PDF-1.4\nSYNTHETIC_OLD_URL' })
  const url = source.data().fileUrl as string
  await page.evaluate((id) => window.knowledgeDriver.deleteHQ(id), source.id)
  expect((await source.ref.get()).exists).toBe(false)
  const response = await request.get(url)
  expect(response.ok()).toBe(true)
  expect(await response.text()).toContain('SYNTHETIC_OLD_URL')
})

test('TEST-K05.mirror-write-failure-recovery (G)', async ({ page }, info) => {
  const source = await addHQ(page, { ...hqInput, visibleToCoordinators: true })
  const failure = await conflictNextWrite(page,
    (path) => path.endsWith(`/knowledgeItems/hq-${source.id}`),
    async () => (await source.ref.get()).data(),
  )
  const outcome = await page.evaluate(async ({ id, input }) => {
    try { await window.knowledgeDriver.updateHQ(id, input); return 'saved' }
    catch (error) { return String(error) }
  }, { id: source.id, input: { ...hqInput, content: 'גרסה חדשה', visibleToCoordinators: true } })
  expect(failure.injected).toBe(1)
  const [sources, mirrors] = await Promise.all([
    adminDb().collection('hq_knowledge').get(),
    adminDb().collection('knowledgeItems').get(),
  ])
  await info.attach('atomicity-evidence', {
    body: JSON.stringify({ failure, outcome, sources: sources.docs.map((doc) => doc.data()), mirrors: mirrors.docs.map((doc) => doc.data()) }),
    contentType: 'application/json',
  })
  // No retry has started: both reads observe the settled original operation.
  expect(sources.size).toBe(1)
  expect(mirrors.size).toBe(1)
  expect(sources.docs[0].id).toBe(source.id)
  expect(sources.docs[0].data().title).toBe(hqInput.title)
  expect([hqInput.content, 'גרסה חדשה']).toContain(sources.docs[0].data().content)
  expect(mirrors.docs[0].id).toBe(`hq-${source.id}`)
  expect(mirrors.docs[0].data()).toMatchObject({
    sourceHQId: source.id,
    title: sources.docs[0].data().title,
    content: sources.docs[0].data().content,
  })
})

test('TEST-K05.retry-recovery (A)', async ({ page }, info) => {
  const source = await addHQ(page, { ...hqInput, visibleToCoordinators: true })
  const failure = await conflictNextWrite(page,
    (path) => path.endsWith(`/knowledgeItems/hq-${source.id}`),
    async () => (await source.ref.get()).data(),
  )
  const update = { ...hqInput, title: 'גרסת התאוששות', content: 'תוכן לאחר ניסיון חוזר', visibleToCoordinators: true }
  const outcome = await page.evaluate(async ({ id, input }) => {
    try { await window.knowledgeDriver.updateHQ(id, input); return 'saved' }
    catch (error) { return String(error) }
  }, { id: source.id, input: update })
  expect(failure.injected).toBe(1)
  await page.evaluate(({ id, input }) => window.knowledgeDriver.updateHQ(id, input), {
    id: source.id, input: update,
  })
  const [sources, mirrors] = await Promise.all([
    adminDb().collection('hq_knowledge').get(),
    adminDb().collection('knowledgeItems').get(),
  ])
  await info.attach('recovery-evidence', {
    body: JSON.stringify({ failure, outcome, sources: sources.docs.map((doc) => doc.data()), mirrors: mirrors.docs.map((doc) => doc.data()) }),
    contentType: 'application/json',
  })
  expect(sources.size).toBe(1)
  expect(mirrors.size).toBe(1)
  expect(sources.docs[0].id).toBe(source.id)
  expect(sources.docs[0].data()).toMatchObject(update)
  expect(mirrors.docs[0].id).toBe(`hq-${source.id}`)
  expect(mirrors.docs[0].data()).toMatchObject({
    branchId: 'global', sourceHQId: source.id, title: update.title, content: update.content, storageUrl: null,
  })
})

test('TEST-K06.research-item-reaches-open-library (G)', async ({ page }) => {
  const source = await addResearch(page, 'מחקר חדש נשמר במערכת', 'סיכום מחקר חדש')
  expect((await adminDb().collection('knowledgeItems').doc(`research-${source.id}`).get()).exists).toBe(true)
  await showKnowledge(page, 'library')
  await page.getByPlaceholder('חיפוש לפי כותרת, נושא, מקור...').fill('מחקר חדש נשמר במערכת')
  await expect(page.getByText('מחקר חדש נשמר במערכת', { exact: true })).toBeVisible()
})

test('TEST-K07.research-write-roundtrip (A)', async ({ page, request }) => {
  const source = await addResearch(page, 'מחקר עם מסמך', 'סיכום ייחודי', {
    name: 'research.pdf', buffer: Buffer.from('%PDF-1.4\nRESEARCH_FILE_SENTINEL'),
  })
  const data = source.data()
  const mirror = (await adminDb().collection('knowledgeItems').doc(`research-${source.id}`).get()).data()
  expect(data).toMatchObject({ titleHe: 'מחקר עם מסמך', type: 'document', summary: 'סיכום ייחודי' })
  expect(mirror).toMatchObject({ title: data.titleHe, content: data.summary, storageUrl: data.storageUrl, articleId: source.id })
  expect(await storageFiles()).toEqual([`knowledge_articles/${source.id}/research.pdf`])
  const file = await request.get(data.storageUrl as string)
  expect(file.ok()).toBe(true)
  expect(await file.text()).toContain('RESEARCH_FILE_SENTINEL')
})

async function attemptResearchConflict(page: Page, persistent = false) {
  const failure = await conflictNextWrite(page, (path) => path.includes('/knowledgeItems/research-'),
    async () => (await adminDb().collection('knowledge_articles').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    { persistent },
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await showKnowledge(page, 'research-admin')
  await page.getByRole('button', { name: /\+ פריט ידע חדש/ }).click()
  await page.getByPlaceholder('שם המאמר / המסמך...').fill('מחקר עם קונפליקט')
  await page.getByPlaceholder('תקציר המאמר...').fill('גרסת מקור')
  await page.getByRole('button', { name: 'שמור מסמך', exact: true }).click()
  await expect.poll(() => failure.injected).toBeGreaterThan(0)
  // Observe completion through the actual retained panel, not an unhandled error.
  await expect.poll(() => page.locator('main').evaluate((main) => {
    const panelOpen = [...main.querySelectorAll('h2')].some((heading) => heading.textContent?.trim() === 'הוסף פריט ידע חדש')
    const save = [...main.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'שמור מסמך')
    return !panelOpen || (!!save && !save.disabled)
  })).toBe(true)
  return { failure, errors }
}

async function researchRecords() {
  const [sources, mirrors] = await Promise.all([
    adminDb().collection('knowledge_articles').get(),
    adminDb().collection('knowledgeItems').get(),
  ])
  return { sources, mirrors }
}

test('TEST-K07.second-write-failure (G)', async ({ page }, info) => {
  const { failure, errors } = await attemptResearchConflict(page)
  const { sources, mirrors } = await researchRecords()
  await info.attach('atomicity-evidence', {
    body: JSON.stringify({ failure, errors, sources: sources.docs.map((doc) => ({ id: doc.id, ...doc.data() })), mirrors: mirrors.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }),
    contentType: 'application/json',
  })
  expect(sources.size).toBe(mirrors.size)
  for (const source of sources.docs) {
    expect(source.data()).toMatchObject({ titleHe: 'מחקר עם קונפליקט', summary: 'גרסת מקור', storageUrl: null })
    const mirror = mirrors.docs.find((doc) => doc.id === `research-${source.id}`)
    expect(mirror?.data()).toMatchObject({
      articleId: source.id, title: source.data().titleHe, content: source.data().summary, storageUrl: source.data().storageUrl,
    })
  }
})

test('TEST-K07.error-visibility (G)', async ({ page }, info) => {
  const { failure, errors } = await attemptResearchConflict(page, true)
  try {
    await expect(page.getByRole('alert').filter({ hasText: /שגיאה|סנכרון|נסה שוב/ }).first()).toBeVisible()
  } finally {
    failure.release()
    await info.attach('error-visibility-evidence', { body: JSON.stringify({ failure, errors }), contentType: 'application/json' })
  }
})

test('TEST-K07.retry-idempotency (G)', async ({ page }, info) => {
  const { failure, errors } = await attemptResearchConflict(page, true)
  failure.release()
  const initial = await researchRecords()
  await info.attach('before-retry-evidence', {
    body: JSON.stringify({ failure, errors, sources: initial.sources.docs.map((doc) => ({ id: doc.id, ...doc.data() })), mirrors: initial.mirrors.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }),
    contentType: 'application/json',
  })
  await expect(page.getByPlaceholder('שם המאמר / המסמך...')).toHaveValue('מחקר עם קונפליקט')
  await expect(page.getByPlaceholder('תקציר המאמר...')).toHaveValue('גרסת מקור')
  await page.getByRole('button', { name: 'שמור מסמך', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'הוסף פריט ידע חדש', exact: true })).toBeHidden()
  await page.reload()
  await expect(page.getByTestId('identity')).toHaveText(FIXTURE.admin.uid)
  await showKnowledge(page, 'research-admin')
  await expect(page.getByText('מחקר עם קונפליקט', { exact: true }).first()).toBeVisible()
  const { sources, mirrors } = await researchRecords()
  await info.attach('after-retry-evidence', {
    body: JSON.stringify({ sources: sources.docs.map((doc) => ({ id: doc.id, ...doc.data() })), mirrors: mirrors.docs.map((doc) => ({ id: doc.id, ...doc.data() })) }),
    contentType: 'application/json',
  })
  expect(sources.size).toBe(1)
  expect(mirrors.size).toBe(1)
  expect(sources.docs[0].data()).toMatchObject({ titleHe: 'מחקר עם קונפליקט', summary: 'גרסת מקור', storageUrl: null })
  expect(mirrors.docs[0].id).toBe(`research-${sources.docs[0].id}`)
  expect(mirrors.docs[0].data()).toMatchObject({
    articleId: sources.docs[0].id, branchId: 'global', title: 'מחקר עם קונפליקט', content: 'גרסת מקור', storageUrl: null,
  })
})
