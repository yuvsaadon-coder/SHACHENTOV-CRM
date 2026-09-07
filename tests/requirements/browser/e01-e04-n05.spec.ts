import { test, expect, type Page } from '@playwright/test'
import { closeAdmin, createBrowserUser, deleteBrowserUser, adminDb, browserTask, stamp } from '../support/browser-seed'

const RUN_ID = `b-${Date.now()}-${Math.random().toString(36).slice(2)}`

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

function modal(page: Page, heading: string) {
  return page.locator('.fixed').filter({ hasText: heading }).last()
}

function currentQuarter() {
  return (['Q1', 'Q2', 'Q3', 'Q4'] as const)[Math.floor(new Date().getMonth() / 3)]
}

async function selectCoveragePeriod(page: Page, quarter: string, year: number) {
  await page.getByRole('button', { name: /כיסוי רבעוני/ }).click()
  await page.locator('select').nth(0).selectOption(quarter)
  await page.locator('select').nth(1).selectOption(String(year))
}

function coverageColumn(page: Page, heading: string) {
  return page.locator('h3', { hasText: heading }).locator('..')
}

function browserFirestoreNetwork(page: Page, enabled: boolean) {
  return page.evaluate((nextEnabled) => {
    const helpers = window as unknown as {
      __requirementsDisableFirestoreNetwork: () => Promise<void>
      __requirementsEnableFirestoreNetwork: () => Promise<void>
    }
    return nextEnabled
      ? helpers.__requirementsEnableFirestoreNetwork()
      : helpers.__requirementsDisableFirestoreNetwork()
  }, enabled)
}

function kanbanCard(page: Page, title: string) {
  return page.getByRole('link', { name: title }).locator('..')
}

function kanbanColumn(page: Page, status: string) {
  return page.locator('.w-56').filter({ has: page.locator('span').filter({ hasText: new RegExp(`^${status}$`) }) }).first()
}

async function dragCardTo(page: Page, title: string, status: string) {
  const cardBox = await kanbanCard(page, title).boundingBox()
  const columnBox = await kanbanColumn(page, status).boundingBox()
  if (!cardBox || !columnBox) throw new Error(`Missing kanban geometry for ${title} -> ${status}`)
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 8, cardBox.y + cardBox.height / 2 + 8)
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + columnBox.height / 2, { steps: 8 })
  await page.mouse.up()
}

async function expectTaskStatus(taskId: string, status: string) {
  await expect.poll(async () => {
    const snap = await adminDb().collection('tasks').doc(taskId).get()
    return snap.get('status') as string | undefined
  }).toBe(status)
}

async function login(page: Page, uid: string) {
  await page.goto('/login')
  await page.getByPlaceholder('your@email.com').fill(`${uid}@requirements.invalid`)
  await page.getByPlaceholder('••••••••').fill('Password123!')
  await page.getByRole('button', { name: /^כניסה$/ }).click()
}

async function loginHq(page: Page, uid: string) {
  await login(page, uid)
  await expect(page).toHaveURL(/\/dashboard/)
}

async function loginCoordinator(page: Page, uid: string) {
  await login(page, uid)
  await expect(page).toHaveURL(/\/portal\/home/)
}

async function seedBranch(branchId: string, coordUid: string, name: string) {
  await adminDb().collection('branches').doc(branchId).set({
    name,
    type: 'food',
    city: 'ירושלים',
    coordinatorUids: [coordUid],
    coordinatorNames: [coordUid],
    createdAt: stamp(),
  })
}

async function cleanupDocs(paths: string[]) {
  await Promise.all(paths.map((path) => adminDb().doc(path).delete()))
}

async function cleanupRunData() {
  const db = adminDb()
  for (const collectionName of ['tasks', 'contacts', 'roles', 'branches', 'reportQuestions', 'quarterlyReports', 'hq_knowledge', 'knowledge_articles', 'knowledgeItems']) {
    const snap = await db.collection(collectionName).get()
    await Promise.all(snap.docs
      .filter((doc) => doc.id.includes(RUN_ID) || JSON.stringify(doc.data()).includes(RUN_ID))
      .map((doc) => doc.ref.delete()))
  }
  const users = await db.collection('users').get()
  for (const user of users.docs.filter((doc) => doc.id.includes(RUN_ID) || JSON.stringify(doc.data()).includes(RUN_ID))) {
    const personalTasks = await user.ref.collection('personalTasks').get()
    await Promise.all(personalTasks.docs.map((task) => task.ref.delete()))
    const chatSessions = await user.ref.collection('chatSessions').get()
    await Promise.all(chatSessions.docs.map((session) => session.ref.delete()))
    await deleteBrowserUser(user.id)
  }
}

test.afterAll(async () => {
  await closeAdmin()
})

test.beforeEach(async ({ page }) => {
  await blockExternalNetwork(page)
})

test.afterEach(async () => {
  await cleanupRunData()
})

test('TEST-E01.task-create-reader creates an HQ task and reads it from the actual task list', async ({ page }) => {
  const uid = id('e01-hq')
  const title = `E01 משימת דפדפן ${uid}`
  await createBrowserUser(uid, 'JLM')
  await loginHq(page, uid)

  await page.goto('/tasks/new')
  await controlNearText(page, 'כותרת משימה').fill(title)
  await controlNearText(page, 'קטגוריה').fill('מסע עצמאי')
  await page.getByRole('button', { name: 'שמור' }).click()
  await expect(page).toHaveURL(/\/tasks\/TASK-/)
  await page.goto('/tasks?monthFilter=false')
  await expect(page.getByRole('link', { name: title }).first()).toBeVisible()

  const created = await adminDb().collection('tasks').where('title', '==', title).get()
  await Promise.all(created.docs.map((doc) => doc.ref.delete()))
  await deleteBrowserUser(uid)
})

test('TEST-E01.contact-link-controls shows independently seeded task/contact link controls', async ({ page }) => {
  const uid = id('e01-contact-hq')
  const taskId = id('linked-task')
  const contactId = id('linked-contact')
  const contactName = `E01 איש קשר ${contactId}`
  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('contacts').doc(contactId).set({
    name: contactName,
    type: 'מטה',
    domainTags: ['JLM'],
    phone: '0500000000',
    email: 'contact@example.invalid',
    role: 'בדיקה',
  })
  await adminDb().collection('tasks').doc(taskId).set({
    ...browserTask(uid, `E01 משימה מקושרת ${taskId}`),
    contactRefs: [contactId],
  })
  await loginHq(page, uid)
  await page.goto(`/tasks/${taskId}`)
  await expect(page.getByText(contactName)).toBeVisible()
  await cleanupDocs([`tasks/${taskId}`, `contacts/${contactId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E01.private-task-and-logout protects private task deep links after logout', async ({ page }) => {
  const uid = id('e01-private-hq')
  const title = `E01 פרטית ${uid}`
  await createBrowserUser(uid, 'JLM')
  await loginHq(page, uid)
  await page.goto('/my-tasks')
  await page.getByPlaceholder('משימה חדשה...').fill(title)
  await page.getByRole('button', { name: '+ הוסף' }).click()
  await expect(page.getByText(title)).toBeVisible()
  await page.getByRole('button', { name: 'יציאה' }).click()
  await page.goto('/my-tasks')
  await expect(page).toHaveURL(/\/login/)
  const snap = await adminDb().collection('users').doc(uid).collection('personalTasks').where('title', '==', title).get()
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()))
  await deleteBrowserUser(uid)
})

test('TEST-E02.branch-link seeded coordinator branch link reaches portal home', async ({ page }) => {
  const uid = id('e02-coord')
  const branchId = id('branch-a')
  const branchName = `E02 סניף ${branchId}`
  await createBrowserUser(uid, 'coordinator')
  await seedBranch(branchId, uid, branchName)
  await loginCoordinator(page, uid)
  await expect(page.getByRole('main').getByText(branchName)).toBeVisible()
  await cleanupDocs([`branches/${branchId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E02.question-to-form admin question appears in actual portal report form', async ({ page }) => {
  const uid = id('e02-question-coord')
  const branchId = id('branch-question')
  const questionId = id('question')
  const label = `E02 שאלת טופס ${questionId}`
  await createBrowserUser(uid, 'coordinator')
  await seedBranch(branchId, uid, `E02 סניף שאלות ${branchId}`)
  await adminDb().collection('reportQuestions').doc(questionId).set({
    branchType: 'food',
    key: questionId,
    label,
    section: 'בדיקות',
    type: 'text',
    firstReportOnly: false,
    order: 1,
  })
  await loginCoordinator(page, uid)
  await page.goto('/portal/report')
  await expect(page.getByText(label)).toBeVisible()
  await cleanupDocs([`reportQuestions/${questionId}`, `branches/${branchId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E02.role-drilldown opens seeded role and preserves edited holder after reopen', async ({ page }) => {
  const uid = id('e02-role-hq')
  const roleId = id('role')
  const roleName = `E02 תפקיד ${roleId}`
  const holder = `מחזיק ${roleId}`
  await createBrowserUser(uid, 'admin')
  await adminDb().collection('roles').doc(roleId).set({
    roleName,
    level: 'מטה',
    area: 'בדיקות',
    holderName: 'ישן',
    status: 'מאויש',
    priority: 'רגיל',
    email: '',
    phone: '',
    linkedTaskIds: [],
    affectsTasks: false,
    delegatedTo: null,
    notes: '',
  })
  await loginHq(page, uid)
  await page.goto('/roles')
  const roleRow = page.locator('tr', { hasText: roleName })
  await expect(roleRow).toBeVisible()
  await roleRow.getByRole('button').click()
  await controlNearText(page, 'ממלא תפקיד').fill(holder)
  await page.getByRole('button', { name: 'שמור' }).click()
  await expect(page.getByText(holder)).toBeVisible()
  await roleRow.getByRole('button').click()
  await expect(controlNearText(page, 'ממלא תפקיד')).toHaveValue(holder)
  await cleanupDocs([`roles/${roleId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E02.shared-knowledge-reader shared HQ item reaches portal knowledge filtering', async ({ page }) => {
  const uid = id('e02-knowledge-coord')
  const hqUid = id('e02-knowledge-admin')
  const branchId = id('branch-knowledge')
  const title = `E02 ידע משותף ${id('hqk')}`
  await createBrowserUser(hqUid, 'admin')
  await createBrowserUser(uid, 'coordinator')
  await seedBranch(branchId, uid, `E02 סניף ידע ${branchId}`)
  await loginHq(page, hqUid)
  await page.goto('/hq-knowledge')
  await page.getByRole('button', { name: '+ הוסף פריט' }).click()
  const hqKnowledgeModal = modal(page, 'הוסף פריט ידע למטה')
  await hqKnowledgeModal.getByPlaceholder('כותרת הפריט').fill(title)
  await controlNearText(page, 'תוכן / תיאור').fill('תוכן ידע משותף')
  await hqKnowledgeModal.getByText('שתף עם רכזים').click()
  await hqKnowledgeModal.getByRole('button', { name: 'שמור' }).click()
  await expect(page.getByText(title).first()).toBeVisible()
  await page.locator('aside').getByRole('button', { name: 'יציאה' }).click()
  await loginCoordinator(page, uid)
  await page.goto('/portal/knowledge')
  await page.getByRole('button', { name: /כלל-ארגוני/, exact: false }).first().click()
  await expect(page.getByText(title)).toBeVisible()
  const hqItems = await adminDb().collection('hq_knowledge').where('title', '==', title).get()
  await Promise.all(hqItems.docs.map((doc) => cleanupDocs([`hq_knowledge/${doc.id}`, `knowledgeItems/hq-${doc.id}`])))
  await cleanupDocs([`branches/${branchId}`])
  await deleteBrowserUser(uid)
  await deleteBrowserUser(hqUid)
})

test('TEST-E03.login-and-selection uses exact coordinator UID and branch picker selection', async ({ page }) => {
  const uid = id('e03-coord')
  const branchA = id('branch-a')
  const branchB = id('branch-b')
  await createBrowserUser(uid, 'coordinator', { phone: '052-1111111' })
  await seedBranch(branchA, uid, `E03 סניף א ${branchA}`)
  await seedBranch(branchB, uid, `E03 סניף ב ${branchB}`)
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסת רכזים' }).click()
  await page.getByPlaceholder('למשל: שירה גולדברג').fill(uid)
  await page.getByPlaceholder('052-0000000').fill('0521111111')
  await page.getByRole('button', { name: 'כניסה לפורטל' }).click()
  await expect(page.getByText('בחר סניף')).toBeVisible()
  await page.getByText(`E03 סניף ב ${branchB}`).click()
  await expect(page.getByRole('main').getByText(`E03 סניף ב ${branchB}`)).toBeVisible()
  await cleanupDocs([`branches/${branchA}`, `branches/${branchB}`])
  await deleteBrowserUser(uid)
})

test('TEST-E03.report-to-coverage submits portal report and observes HQ coverage', async ({ page }) => {
  const coordUid = id('e03-report-coord')
  const hqUid = id('e03-report-hq')
  const branchId = id('branch-report')
  const branchName = `E03 סניף דיווח ${branchId}`
  const questionId = id('report-question')
  const answer = `E03 תשובה ${questionId}`
  const reportQuarter = currentQuarter()
  const reportYear = new Date().getFullYear()
  await createBrowserUser(coordUid, 'coordinator')
  await createBrowserUser(hqUid, 'JLM')
  await seedBranch(branchId, coordUid, branchName)
  await adminDb().collection('reportQuestions').doc(questionId).set({
    branchType: 'food',
    key: questionId,
    label: 'E03 שאלת כיסוי',
    section: 'בדיקות',
    type: 'text',
    firstReportOnly: false,
    order: 1,
  })

  await loginHq(page, hqUid)
  await page.goto('/reports')
  await selectCoveragePeriod(page, reportQuarter, reportYear)
  await expect(coverageColumn(page, 'לא דיווחו').getByText(branchName)).toBeVisible()
  await expect(coverageColumn(page, '🟢 דיווחו').getByText(branchName)).toBeHidden()
  await page.locator('aside').getByRole('button', { name: 'יציאה' }).click()

  await loginCoordinator(page, coordUid)
  await page.goto('/portal/report')
  await controlNearText(page, 'רבעון').selectOption(reportQuarter)
  await controlNearText(page, 'שנה').selectOption(String(reportYear))
  await controlNearText(page, 'E03 שאלת כיסוי').fill(answer)
  await page.getByRole('button', { name: 'שלח דיווח' }).click()
  await expect(page.getByText('תודה! הדיווח נשלח בהצלחה')).toBeVisible()
  await page.getByRole('button', { name: 'יציאה' }).click()
  await loginHq(page, hqUid)
  await page.goto('/reports')
  await selectCoveragePeriod(page, reportQuarter, reportYear)
  await expect(coverageColumn(page, '🟢 דיווחו').getByText(branchName)).toBeVisible()
  await expect(coverageColumn(page, 'לא דיווחו').getByText(branchName)).toBeHidden()
  await page.getByRole('button', { name: '📄 דיווחים' }).click()
  const reportCard = page.getByRole('button').filter({ hasText: branchName }).first()
  await expect(reportCard).toBeVisible()
  await reportCard.click()
  await expect(page.getByText(answer)).toBeVisible()
  const reports = await adminDb().collection('quarterlyReports').where('submittedBy', '==', coordUid).get()
  await Promise.all(reports.docs.map((doc) => doc.ref.delete()))
  await cleanupDocs([`reportQuestions/${questionId}`, `branches/${branchId}`])
  await deleteBrowserUser(coordUid)
  await deleteBrowserUser(hqUid)
})

test('TEST-E03.shared-knowledge production-written mirror item is visible in portal', async ({ page }) => {
  const uid = id('e03-knowledge-coord')
  const branchId = id('branch-shared')
  const title = `E03 ידע כללי ${branchId}`
  await createBrowserUser(uid, 'coordinator')
  await seedBranch(branchId, uid, `E03 סניף ידע ${branchId}`)
  await loginCoordinator(page, uid)
  await page.goto('/portal/knowledge')
  await page.getByRole('button', { name: '+ הוסף' }).click()
  const addKnowledge = modal(page, 'הוסף לידע הסניף')
  await addKnowledge.getByText('מסמך').click()
  await addKnowledge.getByPlaceholder('כותרת הפריט').fill(title)
  await addKnowledge.locator('textarea').fill('תוכן ידע כללי')
  await addKnowledge.getByRole('button', { name: '🌐 כלל-ארגוני' }).click()
  await addKnowledge.getByRole('button', { name: 'שמור' }).click()
  await expect(addKnowledge).toBeHidden()
  await page.getByRole('button', { name: /כלל-ארגוני/, exact: false }).first().click()
  await expect(page.getByText(title)).toBeVisible()
  const snap = await adminDb().collection('knowledgeItems').where('title', '==', title).get()
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()))
  await cleanupDocs([`branches/${branchId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E03.branch-chat-context sends actual portal chat request and renders deterministic reply', async ({ page }) => {
  const uid = id('e03-chat-coord')
  const branchId = id('branch-chat')
  await createBrowserUser(uid, 'coordinator')
  await seedBranch(branchId, uid, `E03 סניף צאט ${branchId}`)
  await adminDb().collection('knowledgeItems').doc(id('chat-knowledge')).set({
    branchId,
    title: 'E03 מקור צאט',
    content: 'תוכן צאט',
    type: 'document',
    tags: [],
    createdBy: uid,
    createdAt: stamp(),
  })
  await loginCoordinator(page, uid)
  await page.goto('/portal/chat')
  await page.getByPlaceholder('שאל שאלה...').fill('מה מקור הידע?')
  await page.getByRole('button', { name: 'שלח' }).click()
  await expect(page.getByText('תשובת בדיקה ממודל מקומי')).toBeVisible()
  await cleanupDocs([`knowledgeItems/${id('chat-knowledge')}`, `branches/${branchId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E03.foreign-chat-denial demonstrates authorized branch positive control before foreign denial', async ({ page }) => {
  const uid = id('e03-foreign-chat-coord')
  const otherUid = id('e03-foreign-chat-other')
  const branchA = id('branch-chat-a')
  const branchB = id('branch-chat-b')
  await createBrowserUser(uid, 'coordinator')
  await createBrowserUser(otherUid, 'coordinator')
  await seedBranch(branchA, uid, `E03 צאט א ${branchA}`)
  await adminDb().collection('branches').doc(branchB).set({
    name: `E03 צאט ב ${branchB}`,
    type: 'food',
    city: 'חיפה',
    coordinatorUids: [otherUid],
    createdAt: stamp(),
  })
  await loginCoordinator(page, uid)
  await page.goto('/portal/chat')
  await page.getByPlaceholder('שאל שאלה...').fill('positive')
  await page.getByRole('button', { name: 'שלח' }).click()
  await expect(page.getByText('תשובת בדיקה ממודל מקומי')).toBeVisible()
  const statuses = await page.evaluate(async ({ ownBranchId, foreignBranchId }) => {
    const token = await (window as unknown as { __requirementsGetCurrentIdToken: () => Promise<string> }).__requirementsGetCurrentIdToken()
    const call = (branchId: string) =>
      fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branchId,
          mode: 'branch',
          question: 'authorization check',
          messages: [{ role: 'user', content: 'authorization check' }],
        }),
      }).then((r) => r.status)
    return {
      own: await call(ownBranchId),
      foreign: await call(foreignBranchId),
    }
  }, { ownBranchId: branchA, foreignBranchId: branchB })
  expect(statuses.own).toBe(200)
  expect(statuses.foreign).toBe(403)
  await cleanupDocs([`branches/${branchA}`, `branches/${branchB}`])
  await deleteBrowserUser(uid)
  await deleteBrowserUser(otherUid)
})

test('TEST-E04.task-detail-live updates an open task detail from another client', async ({ page }) => {
  const uid = id('e04-live-hq')
  const taskId = id('live-task')
  const title = `E04 חיה ${taskId}`
  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('tasks').doc(taskId).set(browserTask(uid, title))
  await loginHq(page, uid)
  await page.goto(`/tasks/${taskId}`)
  await expect(page.getByText(title)).toBeVisible()
  await expect(page.getByText('E04 עדכון חי')).toBeHidden()
  await page.waitForTimeout(500)
  await adminDb().collection('tasks').doc(taskId).update({ notes: 'E04 עדכון חי', updatedAt: stamp() })
  await expect(page.getByText('E04 עדכון חי')).toBeVisible()
  await cleanupDocs([`tasks/${taskId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E04.contact-reconnect observes contact updates after page reconnect', async ({ page }) => {
  const uid = id('e04-contact-hq')
  const contactId = id('contact')
  const onlineName = 'E04 איש קשר אונליין'
  const reconnectedName = 'E04 איש קשר אחרי חיבור'
  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('contacts').doc(contactId).set({ name: 'E04 איש קשר ישן', type: 'מטה', domainTags: ['JLM'] })
  await loginHq(page, uid)
  await page.goto('/contacts')
  await expect(page.getByText('E04 איש קשר ישן')).toBeVisible()
  await adminDb().collection('contacts').doc(contactId).update({ name: onlineName })
  await expect(page.getByText(onlineName)).toBeVisible()
  await browserFirestoreNetwork(page, false)
  await adminDb().collection('contacts').doc(contactId).update({ name: reconnectedName })
  await expect(page.getByText(reconnectedName)).toBeHidden()
  await browserFirestoreNetwork(page, true)
  await expect(page.getByText(reconnectedName)).toBeVisible()
  await cleanupDocs([`contacts/${contactId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E04.report-reconnect observes report updates after page reconnect', async ({ page }) => {
  const uid = id('e04-report-hq')
  const branchId = id('branch-report')
  const reportId = id('report')
  const onlineValue = 'E04 ערך אונליין'
  const reconnectedValue = 'E04 ערך אחרי חיבור'
  await createBrowserUser(uid, 'JLM')
  await seedBranch(branchId, uid, `E04 סניף ${branchId}`)
  await adminDb().collection('quarterlyReports').doc(reportId).set({
    branchId,
    branchType: 'food',
    quarter: 'Q1',
    year: 2026,
    submittedBy: uid,
    submittedAt: stamp(),
    isFirstReport: false,
    data: { answer: 'E04 ערך ישן' },
  })
  await loginHq(page, uid)
  await page.goto('/reports')
  const reportCard = page.getByRole('button').filter({ hasText: `E04 סניף ${branchId}` }).first()
  await expect(reportCard).toBeVisible()
  await reportCard.click()
  await expect(page.getByText('E04 ערך ישן')).toBeVisible()
  await adminDb().collection('quarterlyReports').doc(reportId).update({ data: { answer: onlineValue } })
  await expect(page.getByText(onlineValue)).toBeVisible()
  await browserFirestoreNetwork(page, false)
  await adminDb().collection('quarterlyReports').doc(reportId).update({ data: { answer: reconnectedValue } })
  await expect(page.getByText(reconnectedValue)).toBeHidden()
  await browserFirestoreNetwork(page, true)
  await expect(page.getByText(reconnectedValue)).toBeVisible()
  await cleanupDocs([`quarterlyReports/${reportId}`, `branches/${branchId}`])
  await deleteBrowserUser(uid)
})

test('TEST-E04.identity-transition separates HQ and coordinator surfaces in one browser', async ({ page }) => {
  const hqUid = id('e04-hq')
  const coordUid = id('e04-coord')
  const branchId = id('branch-identity')
  await createBrowserUser(hqUid, 'JLM')
  await createBrowserUser(coordUid, 'coordinator')
  await seedBranch(branchId, coordUid, `E04 זהות ${branchId}`)
  await loginHq(page, hqUid)
  await expect(page).toHaveURL(/\/dashboard/)
  await page.getByRole('button', { name: 'יציאה' }).click()
  await loginCoordinator(page, coordUid)
  await expect(page.getByRole('main').getByText(`E04 זהות ${branchId}`)).toBeVisible()
  await cleanupDocs([`branches/${branchId}`])
  await deleteBrowserUser(hqUid)
  await deleteBrowserUser(coordUid)
})

test('TEST-N05.orgcard-keyboard opens org card details with keyboard activation', async ({ page }) => {
  const uid = id('n05-org-hq')
  const roleId = id('org-role')
  const roleName = `N05 תפקיד ${roleId}`
  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('roles').doc(roleId).set({
    roleName,
    level: 'מטה',
    area: 'בדיקות',
    holderName: 'מחזיק',
    status: 'מאויש',
    priority: 'רגיל',
    email: '',
    phone: '',
    linkedTaskIds: [],
    affectsTasks: false,
    delegatedTo: null,
    notes: '',
  })
  await loginHq(page, uid)
  await page.goto('/orgchart')
  await page.getByRole('button', { name: `ערוך תפקיד: ${roleName}` }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'עריכת תפקיד' })).toBeVisible()
  await expect(controlNearText(page, 'ממלא תפקיד')).toHaveValue('מחזיק')
  await cleanupDocs([`roles/${roleId}`])
  await deleteBrowserUser(uid)
})

test('TEST-N05.kanban-keyboard changes native Kanban status select with keyboard', async ({ page }) => {
  const uid = id('n05-kanban-hq')
  const taskId = id('kanban-task')
  const title = `N05 קנבן ${taskId}`
  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('tasks').doc(taskId).set({ ...browserTask(uid, title), status: 'בעבודה' })
  await loginHq(page, uid)
  await page.goto('/tasks?monthFilter=false&view=kanban')
  await expect(page.getByText(title)).toBeVisible()
  const statusSelect = kanbanCard(page, title).locator('select')
  await statusSelect.focus()
  await expect(statusSelect).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expectTaskStatus(taskId, 'בוצע')
  await expect(statusSelect).toHaveValue('בוצע')
  await cleanupDocs([`tasks/${taskId}`])
  await deleteBrowserUser(uid)
})

test('TEST-T05.pointer-move moves a Kanban card with real pointer drag', async ({ page }) => {
  const uid = id('t05-pointer-hq')
  const taskId = id('pointer-task')
  const title = `T05 גרירה ${taskId}`
  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('tasks').doc(taskId).set({ ...browserTask(uid, title), status: 'בעבודה' })
  await loginHq(page, uid)
  await page.goto('/tasks?monthFilter=false&view=kanban')
  await expect(kanbanColumn(page, 'בעבודה').getByText(title)).toBeVisible()
  await dragCardTo(page, title, 'בוצע')
  await expectTaskStatus(taskId, 'בוצע')
  await expect(kanbanColumn(page, 'בוצע').getByText(title)).toBeVisible()
  await cleanupDocs([`tasks/${taskId}`])
  await deleteBrowserUser(uid)
})

test('TEST-T05.cancelled-drop keeps Kanban status after a real cancelled drag', async ({ page }) => {
  const uid = id('t05-cancel-hq')
  const taskId = id('cancel-task')
  const title = `T05 ביטול ${taskId}`
  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('tasks').doc(taskId).set({ ...browserTask(uid, title), status: 'בעבודה' })
  await loginHq(page, uid)
  await page.goto('/tasks?monthFilter=false&view=kanban')
  const cardBox = await kanbanCard(page, title).boundingBox()
  if (!cardBox) throw new Error(`Missing kanban card geometry for ${title}`)
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 40, cardBox.y + cardBox.height / 2 + 40)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expectTaskStatus(taskId, 'בעבודה')
  await expect(kanbanColumn(page, 'בעבודה').getByText(title)).toBeVisible()
  await cleanupDocs([`tasks/${taskId}`])
  await deleteBrowserUser(uid)
})

test('TEST-T05.same-column-drop keeps Kanban status after dropping on the current column', async ({ page }) => {
  const uid = id('t05-same-hq')
  const taskId = id('same-task')
  const title = `T05 אותו טור ${taskId}`
  await createBrowserUser(uid, 'JLM')
  await adminDb().collection('tasks').doc(taskId).set({ ...browserTask(uid, title), status: 'בעבודה' })
  await loginHq(page, uid)
  await page.goto('/tasks?monthFilter=false&view=kanban')
  await dragCardTo(page, title, 'בעבודה')
  await expectTaskStatus(taskId, 'בעבודה')
  await expect(kanbanColumn(page, 'בעבודה').getByText(title)).toBeVisible()
  await cleanupDocs([`tasks/${taskId}`])
  await deleteBrowserUser(uid)
})

test('TEST-N05.actual-dialog-focus focuses first control in real contact dialog', async ({ page }) => {
  const uid = id('n05-dialog-hq')
  await createBrowserUser(uid, 'JLM')
  await loginHq(page, uid)
  await page.goto('/contacts')
  await page.getByRole('button', { name: '+ הוסף איש קשר' }).click()
  await expect(page.getByRole('heading', { name: 'איש קשר חדש' })).toBeVisible()
  await expect(modal(page, 'איש קשר חדש').locator('input').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'איש קשר חדש' })).toBeHidden()
  await deleteBrowserUser(uid)
})

test('TEST-N05.dialog-tab-wrap keeps focus inside real contact dialog', async ({ page }) => {
  const uid = id('n05-dialog-trap-hq')
  await createBrowserUser(uid, 'JLM')
  await loginHq(page, uid)
  await page.goto('/contacts')
  await page.getByRole('button', { name: '+ הוסף איש קשר' }).click()
  const dialog = modal(page, 'איש קשר חדש')
  await expect(page.getByRole('heading', { name: 'איש קשר חדש' })).toBeVisible()
  const firstInput = dialog.locator('input').first()
  const lastButton = dialog.getByRole('button', { name: 'ביטול' })
  await firstInput.focus()
  await expect(firstInput).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(lastButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(firstInput).toBeFocused()
  await deleteBrowserUser(uid)
})

test('TEST-N05.dialog-escape-close closes real contact dialog with Escape', async ({ page }) => {
  const uid = id('n05-dialog-escape-hq')
  await createBrowserUser(uid, 'JLM')
  await loginHq(page, uid)
  await page.goto('/contacts')
  await page.getByRole('button', { name: '+ הוסף איש קשר' }).click()
  await expect(page.getByRole('heading', { name: 'איש קשר חדש' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'איש קשר חדש' })).toBeHidden()
  await deleteBrowserUser(uid)
})

test('TEST-N05.rtl-critical-controls keeps core pages and portal forms RTL', async ({ page }) => {
  const hqUid = id('n05-rtl-hq')
  const coordUid = id('n05-rtl-coord')
  const branchId = id('rtl-branch')
  await createBrowserUser(hqUid, 'JLM')
  await createBrowserUser(coordUid, 'coordinator')
  await seedBranch(branchId, coordUid, `N05 RTL ${branchId}`)
  await loginHq(page, hqUid)
  await page.goto('/tasks?monthFilter=false')
  await expect(page.locator('[dir="rtl"]').first()).toBeVisible()
  await page.locator('aside').getByRole('button', { name: 'יציאה' }).click()
  await loginCoordinator(page, coordUid)
  await expect(page.locator('[dir="rtl"]').first()).toBeVisible()
  await cleanupDocs([`branches/${branchId}`])
  await deleteBrowserUser(hqUid)
  await deleteBrowserUser(coordUid)
})
