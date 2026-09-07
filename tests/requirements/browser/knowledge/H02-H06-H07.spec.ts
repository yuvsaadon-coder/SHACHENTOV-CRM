import { test, expect, type Page } from '@playwright/test'
import { handler as hqChatHandler } from '../../../../netlify/functions/hq-chat'
import { adminDb } from '../../support/knowledge-admin'
import { FIXTURE } from '../../support/knowledge-fixtures'
import { makeEvent, invoke } from '../../support/knowledge-netlify-handler'
import { prepareKnowledge, cleanupKnowledge, showKnowledge, signInKnowledge, conflictNextWrite } from '../../support/knowledge-browser'

test.beforeEach(async ({ page }) => {
  await prepareKnowledge(page, FIXTURE.coordA.uid)
})
test.afterEach(async ({ page }, info) => { await cleanupKnowledge(page, info) })

test('TEST-H02.branch-switch-no-session-mixing (G)', async ({ page }) => {
  await adminDb().collection('branches').doc('branch-b').set({
    name: 'סניף ב', type: 'food', city: 'תל אביב', coordinatorUids: [FIXTURE.coordA.uid],
  })
  let received = false
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/.netlify/functions/chat', async (route) => {
    received = true
    expect(route.request().postDataJSON()).toMatchObject({ branchId: 'branch-a', mode: 'branch' })
    await pending
    await route.fulfill({ json: { reply: 'BRANCH_A_PENDING_REPLY' } })
  })
  await showKnowledge(page, 'chat')
  await page.getByRole('button', { name: 'סניף שלי', exact: true }).click()
  await page.locator('textarea').fill('BRANCH_A_PENDING_QUESTION')
  await page.getByRole('button', { name: 'שלח', exact: true }).click()
  await expect.poll(() => received).toBe(true)
  await expect(page.getByRole('button', { name: 'שלח', exact: true })).toBeDisabled()
  // Only context changes: the original PortalChat and its in-flight send remain mounted.
  await page.getByLabel('Driver branch').selectOption('branch-b')
  release()
  await expect(page.getByText('מקליד...', { exact: true })).toBeHidden()
  await expect(page.getByText('BRANCH_A_PENDING_REPLY', { exact: true })).toBeHidden()
  await expect(page.getByText('BRANCH_A_PENDING_QUESTION', { exact: true })).toBeHidden()
})

test('TEST-H07.save-failure-visible (G)', async ({ page }, info) => {
  await page.route('**/.netlify/functions/chat', (route) => route.fulfill({ json: { reply: 'תשובה תקינה לפני כשל שמירה' } }))
  const failure = await conflictNextWrite(page, (path) => path.includes(`/users/${FIXTURE.coordA.uid}/chatSessions/`),
    async () => ({ existing: (await adminDb().collection(`users/${FIXTURE.coordA.uid}/chatSessions`).get()).size }),
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await showKnowledge(page, 'chat')
  await page.locator('textarea').fill('שיחה תקינה לשמירה')
  await page.getByRole('button', { name: 'שלח', exact: true }).click()
  await expect(page.getByText('תשובה תקינה לפני כשל שמירה', { exact: true })).toBeVisible()
  await expect.poll(() => failure.injected).toBe(1)
  expect((await adminDb().collection(`users/${FIXTURE.coordA.uid}/chatSessions`).get()).empty).toBe(true)
  try {
    await expect(page.locator('main')).toContainText(/שגיאה.*שמיר|שמירה.*נכשלה|לא נשמר/)
  } finally {
    await info.attach('fault-evidence', { body: JSON.stringify({ failure, errors }), contentType: 'application/json' })
  }
})

const challenge = 'CHALLENGE_SENTINEL_TEXT'
const marker2025 = 'Q3_2025_SENTINEL'
const marker2026 = 'Q3_2026_SENTINEL'
type ProviderBody = { system?: string; messages?: Array<{ content: string }> }

async function submitReport(page: Page, branchId: string, year: string, text: string) {
  await showKnowledge(page, 'hooks')
  await page.getByLabel('Driver branch').selectOption(branchId)
  await showKnowledge(page, 'report')
  await expect(page.locator('main textarea')).toHaveCount(1)
  await page.locator('main select').nth(0).selectOption('Q3')
  await page.locator('main select').nth(1).selectOption(year)
  await page.locator('main textarea').fill(text)
  await page.getByRole('button', { name: /שלח דיווח/ }).click()
  await expect(page.getByText('תודה! הדיווח נשלח בהצלחה', { exact: true })).toBeVisible()
  const reports = await adminDb().collection('quarterlyReports').where('branchId', '==', branchId).where('year', '==', Number(year)).get()
  expect(reports.size).toBe(1)
  expect(reports.docs[0].data()).toMatchObject({ data: { challenge: text }, submittedBy: FIXTURE.coordA.uid })
  expect(reports.docs[0].data()).not.toHaveProperty('answers')
}

async function produceReportFixtures(page: Page) {
  await page.clock.setFixedTime(new Date('2026-09-07T12:00:00Z'))
  await adminDb().collection('reportQuestions').doc('challenge').set({
    branchType: 'food', key: 'challenge', label: 'מהם אתגרי המתנדבים?', type: 'textarea',
    section: 'מצב הסניף', order: 1, firstReportOnly: false,
  })
  for (const suffix of ['b', 'c', 'd']) {
    await adminDb().collection('branches').doc(`branch-${suffix}`).set({
      name: `סניף ${{ b: 'ב', c: 'ג', d: 'ד' }[suffix]}`, type: 'food', city: 'עיר בדיקה',
      coordinatorUids: [FIXTURE.coordA.uid],
    })
  }
  await submitReport(page, 'branch-a', '2025', marker2025)
  await submitReport(page, 'branch-a', '2026', `${challenge} ${marker2026}`)
  await submitReport(page, 'branch-c', '2026', 'BRANCH_C_SUBMITTED')
  await showKnowledge(page, 'hooks')
  await signInKnowledge(page, FIXTURE.hq.uid)
}

async function withProvider<T>(fn: (captured: ProviderBody[]) => Promise<T>) {
  const original = globalThis.fetch
  const calls: ProviderBody[] = []
  const previousKey = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'SYNTHETIC_KNOWLEDGE_PROVIDER_KEY'
  globalThis.fetch = (async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === 'https://api.anthropic.com/v1/messages') {
      calls.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'DETERMINISTIC_REPORT_REPLY' }] }),
        { headers: { 'Content-Type': 'application/json' } })
    }
    if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Non-local request blocked')
    return original(input, init)
  }) as typeof fetch
  try { return await fn(calls) }
  finally {
    globalThis.fetch = original
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previousKey
  }
}

async function askReports(page: Page, question: string, branchFilter: string | null) {
  const token = await page.evaluate(() => window.knowledgeDriver.idToken())
  return invoke(hqChatHandler, makeEvent({
    httpMethod: 'POST', headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ scopes: ['reports'], branchFilter, question, messages: [{ role: 'user', content: question }] }),
  }))
}

for (const [id, question, expected, filter] of [
  ['challenge-content', 'מהם אתגרי המתנדבים ברבעון 3 2026?', [challenge], 'branch-a'],
  ['year-disambiguation', 'השווה Q3 2025 מול Q3 2026', [marker2025, marker2026, '2025', '2026'], 'branch-a'],
  ['missing-roster-context', 'אילו סניפים לא דיווחו ברבעון 3 2026?', ['סניף ב', 'סניף ד'], null],
] as const) {
  test(`TEST-H06.${id} (G)`, async ({ page }, info) => {
    await produceReportFixtures(page)
    await withProvider(async (calls) => {
      const response = await askReports(page, question, filter)
      expect(response.statusCode).toBe(200)
      expect(calls).toHaveLength(1)
      await info.attach('provider-context', { body: JSON.stringify(calls), contentType: 'application/json' })
      if (id === 'missing-roster-context') {
        for (const [name, branchId] of [['סניף ב', 'branch-b'], ['סניף ד', 'branch-d']]) {
          expect.soft(calls[0].system?.includes(name) || calls[0].system?.includes(branchId)).toBe(true)
        }
      } else {
        for (const fact of expected) expect.soft(calls[0].system).toContain(fact)
      }
    })
  })
}

async function openBranchAnalysis(page: Page) {
  await showKnowledge(page, 'branches')
  await page.getByPlaceholder('חיפוש...').fill('סניף א')
  await page.getByRole('button', { name: /דיווחים/ }).click()
  await expect(page.getByRole('heading', { name: 'דיווחים — סניף א', exact: true })).toBeVisible()
  await expect(page.getByText('2 דיווחים', { exact: true })).toBeVisible()
}

for (const id of ['branch-analysis-context', 'reply-rendering']) {
  test(`TEST-H06.${id} (A)`, async ({ page }, info) => {
    await produceReportFixtures(page)
    await withProvider(async (calls) => {
      await page.route('**/.netlify/functions/hq-chat', async (route) => {
        const request = route.request()
        const response = await invoke(hqChatHandler, makeEvent({
          httpMethod: request.method(), headers: await request.allHeaders(), body: request.postData(),
        }))
        await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body ?? '' })
      })
      await openBranchAnalysis(page)
      await page.getByRole('button', { name: /ניתוח AI/ }).click()
      await expect(page.getByText('DETERMINISTIC_REPORT_REPLY', { exact: false })).toBeVisible()
      expect(calls).toHaveLength(1)
      if (id === 'branch-analysis-context') {
        const turns = calls[0].messages?.map((message) => message.content).join('\n')
        for (const fact of [challenge, marker2025, marker2026, '2025', '2026']) expect(turns).toContain(fact)
      }
      await info.attach('provider-request', { body: JSON.stringify(calls), contentType: 'application/json' })
    })
  })
}
