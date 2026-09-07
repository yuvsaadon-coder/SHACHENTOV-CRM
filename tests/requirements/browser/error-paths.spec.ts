import { test, expect, type Page } from '@playwright/test'
import { adminDb, browserTask, closeAdmin, createBrowserUser, deleteBrowserUser, stamp } from '../support/browser-seed'
import { conflictNextWrite } from '../support/knowledge-browser'

const RUN_ID = `err-${Date.now()}-${Math.random().toString(36).slice(2)}`

function id(testId: string) {
  return `${RUN_ID}-${testId}`
}

async function blockExternalNetwork(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.continue()
    return route.abort('blockedbyclient')
  })
}

function controlNearText(page: Page, text: string) {
  return page.locator('label', { hasText: text }).locator('..').locator('input, textarea, select').first()
}

function contactModal(page: Page, heading = 'עריכת איש קשר') {
  return page.locator('.fixed').filter({ hasText: heading }).last()
}

function contactRow(page: Page, name: string) {
  return page.locator('tr', { hasText: name }).first()
}

function kanbanCard(page: Page, title: string) {
  return page.getByRole('link', { name: title }).locator('..')
}

async function loginHq(page: Page, uid: string) {
  await page.goto('/login')
  await page.getByPlaceholder('your@email.com').fill(`${uid}@requirements.invalid`)
  await page.getByPlaceholder('••••••••').fill('Password123!')
  await page.getByRole('button', { name: /^כניסה$/ }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

async function expectTaskStatus(taskId: string, status: string) {
  await expect.poll(async () => {
    const snap = await adminDb().collection('tasks').doc(taskId).get()
    return snap.get('status') as string | undefined
  }).toBe(status)
}

async function cleanupRunData() {
  const db = adminDb()
  for (const collectionName of ['tasks', 'contacts']) {
    const snap = await db.collection(collectionName).get()
    await Promise.all(snap.docs
      .filter((doc) => doc.id.includes(RUN_ID) || JSON.stringify(doc.data()).includes(RUN_ID))
      .map((doc) => doc.ref.delete()))
  }
  const users = await db.collection('users').get()
  for (const user of users.docs.filter((doc) => doc.id.includes(RUN_ID) || JSON.stringify(doc.data()).includes(RUN_ID))) {
    await deleteBrowserUser(user.id)
  }
}

test.beforeEach(async ({ page }) => {
  await blockExternalNetwork(page)
})

test.afterEach(async () => {
  await cleanupRunData()
})

test.afterAll(async () => {
  await closeAdmin()
})

test('TEST-C01.failed-save-actionable.browser (G)', async ({ page }) => {
  const uid = id('c01-save-hq')
  const contactId = id('contact-save')
  const originalName = `C01 שמירה ${contactId}`
  const positiveName = `${originalName} מותר`
  const failedName = `${originalName} נכשל`
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()) })

  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('contacts').doc(contactId).set({
    name: originalName,
    type: 'מטה',
    domainTags: ['JLM'],
    phone: '0500000000',
    email: 'contact@example.invalid',
    role: 'בדיקה',
    notes: '',
    organization: '',
    category: '',
    ownerInOrg: '',
    cadence: '',
    needsInfo: false,
  })

  await loginHq(page, uid)
  await page.goto('/contacts')
  await expect(contactRow(page, originalName)).toBeVisible()

  await contactRow(page, originalName).locator('button[title="עריכה"]').click()
  await controlNearText(page, 'שם').fill(positiveName)
  await contactModal(page).getByRole('button', { name: 'שמור' }).click()
  await expect(contactRow(page, positiveName)).toBeVisible()
  await expect.poll(async () => (await adminDb().collection('contacts').doc(contactId).get()).get('name')).toBe(positiveName)

  const failure = await conflictNextWrite(
    page,
    (path) => path.includes(`/contacts/${contactId}`),
    async () => (await adminDb().collection('contacts').doc(contactId).get()).data(),
  )
  await contactRow(page, positiveName).locator('button[title="עריכה"]').click()
  await controlNearText(page, 'שם').fill(failedName)
  await contactModal(page).getByRole('button', { name: 'שמור' }).click()
  await expect.poll(() => failure.injected).toBe(1)
  await expect(contactModal(page).locator('input').first()).toHaveValue(failedName)
  await expect(contactModal(page)).toContainText(/שגיאה|נכשל|לא נשמר|נסה שוב/)
  failure.release()
  await contactModal(page).getByRole('button', { name: 'שמור' }).click()
  await expect(contactRow(page, failedName)).toBeVisible()
  await test.info().attach('page-errors-diagnostic', {
    body: pageErrors.join('\n') || '(none)',
    contentType: 'text/plain',
  })
})

test('TEST-C01.failed-delete-actionable.browser (G)', async ({ page }) => {
  const uid = id('c01-delete-hq')
  const targetId = id('contact-delete-target')
  const controlId = id('contact-delete-control')
  const targetName = `C01 מחיקה ${targetId}`
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()) })

  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('contacts').doc(targetId).set({
    name: targetName,
    type: 'מטה',
    domainTags: ['JLM'],
    phone: '',
    email: '',
    role: '',
    notes: '',
    organization: '',
    category: '',
    ownerInOrg: '',
    cadence: '',
    needsInfo: false,
  })
  await adminDb().collection('contacts').doc(controlId).set({
    name: `C01 מחיקה מותרת ${controlId}`,
    type: 'מטה',
    domainTags: ['JLM'],
    phone: '',
    email: '',
    role: '',
    notes: '',
    organization: '',
    category: '',
    ownerInOrg: '',
    cadence: '',
    needsInfo: false,
  })

  await loginHq(page, uid)
  await page.goto('/contacts')
  await contactRow(page, `C01 מחיקה מותרת ${controlId}`).locator('button[title="עריכה"]').click()
  await contactModal(page).getByRole('button', { name: 'מחק' }).click()
  await contactModal(page).getByRole('button', { name: 'אשר מחיקה' }).click()
  await expect.poll(async () => (await adminDb().collection('contacts').doc(controlId).get()).exists).toBe(false)

  await expect(contactRow(page, targetName)).toBeVisible()
  await contactRow(page, targetName).locator('button[title="עריכה"]').click()
  await adminDb().collection('users').doc(uid).update({ role: 'coordinator' })
  await contactModal(page).getByRole('button', { name: 'מחק' }).click()
  await contactModal(page).getByRole('button', { name: 'אשר מחיקה' }).click()
  await expect.poll(async () => (await adminDb().collection('contacts').doc(targetId).get()).exists).toBe(true)
  await expect(contactModal(page)).toContainText(/שגיאה|נכשל|לא נמחק|נסה שוב/)
  await test.info().attach('page-errors-diagnostic', {
    body: pageErrors.join('\n') || '(none)',
    contentType: 'text/plain',
  })
})

test('TEST-T05.failed-write-observable.browser (G)', async ({ page }) => {
  const uid = id('t05-failed-write-hq')
  const taskId = id('task-denied-status')
  const title = `T05 כתיבה נדחית ${taskId}`
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()) })

  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('tasks').doc(taskId).set({ ...browserTask(uid, title), status: 'בעבודה' })
  await loginHq(page, uid)
  await page.goto('/tasks?monthFilter=false&view=kanban')
  const statusSelect = kanbanCard(page, title).locator('select')
  await expect(statusSelect).toHaveValue('בעבודה')

  await statusSelect.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expectTaskStatus(taskId, 'בוצע')

  await adminDb().collection('tasks').doc(taskId).update({ status: 'בעבודה', updatedAt: stamp() })
  await expect(statusSelect).toHaveValue('בעבודה')
  await adminDb().collection('users').doc(uid).update({ role: 'coordinator' })

  await statusSelect.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expectTaskStatus(taskId, 'בעבודה')
  await expect(page.locator('main')).toContainText(/שגיאה|נכשל|לא נשמר|נסה שוב/)
  await test.info().attach('page-errors-diagnostic', {
    body: pageErrors.join('\n') || '(none)',
    contentType: 'text/plain',
  })
})
