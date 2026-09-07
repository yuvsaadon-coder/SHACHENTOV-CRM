import { expect, type Page, type TestInfo } from '@playwright/test'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { adminApp, adminDb, clearAuthUsers, clearFirestore, clearStorage } from './knowledge-admin'
import { FIXTURE, seedCoordinator, seedHqUser } from './knowledge-fixtures'
import { EMULATORS, PROJECT_ID, assertEmulatorEnvironment } from './emulator-env'

export const hqInput: Omit<Parameters<Window['knowledgeDriver']['addHQ']>[0], 'file'> = {
  domain: 'FIN', category: 'tips',
  title: 'פריט מטה לבדיקה', content: 'תוכן מטה סינתטי', tags: ['לוגיסטיקה'],
  visibleToCoordinators: false,
}
const browserErrors = new WeakMap<Page, string[]>()

export async function prepareKnowledge(page: Page, uid = FIXTURE.admin.uid) {
  assertEmulatorEnvironment()
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await clearStorage()
  await clearFirestore()
  await clearAuthUsers()
  await seedHqUser({ uid: FIXTURE.admin.uid, name: FIXTURE.admin.name, role: 'admin' })
  await seedHqUser({ uid: FIXTURE.hq.uid, name: FIXTURE.hq.name, role: 'FIN' })
  await seedCoordinator({
    ...FIXTURE.coordA, branchId: FIXTURE.branchA.id, branchName: FIXTURE.branchA.name,
  })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) await route.continue()
    else await route.abort('blockedbyclient')
  })
  await page.goto('/tests/requirements/support/knowledge-browser-driver.html')
  await expect(page.getByTestId('identity')).toHaveText('signed-out')
  await signInKnowledge(page, uid)
  await expect(page.getByLabel('Driver branch').locator('option[value="branch-a"]')).toHaveCount(1)
}

export async function signInKnowledge(page: Page, uid: string) {
  const token = await getAuth(adminApp()).createCustomToken(uid)
  await page.evaluate((customToken) => window.knowledgeDriver.signIn(customToken), token)
  // This is the SAME AuthProvider that supplies all tested writers and consumers.
  await expect(page.getByTestId('identity')).toHaveText(uid)
}

export async function cleanupKnowledge(page: Page, info: TestInfo) {
  if (!page.isClosed()) {
    await info.attach('rendered-state', { body: await page.locator('body').innerText(), contentType: 'text/plain' })
    await info.attach('browser-errors', { body: JSON.stringify(browserErrors.get(page) ?? []), contentType: 'application/json' })
    await page.close()
  }
  browserErrors.delete(page)
  await clearStorage()
  await clearFirestore()
  await clearAuthUsers()
}

export async function showKnowledge(page: Page, view: string) {
  await page.getByLabel('Driver view').selectOption(view)
}

export async function addHQ(page: Page, data = hqInput, file?: { name: string; content: string }) {
  await page.evaluate(async ({ input, attachment }) => {
    await window.knowledgeDriver.addHQ({
      ...input,
      ...(attachment ? { file: new File([attachment.content], attachment.name, { type: 'application/pdf' }) } : {}),
    })
  }, { input: data, attachment: file })
  const docs = await adminDb().collection('hq_knowledge').where('title', '==', data.title).get()
  expect(docs.size).toBe(1)
  return docs.docs[0]
}

export async function addResearch(page: Page, title: string, content: string, file?: { name: string; buffer: Buffer }) {
  await showKnowledge(page, 'research-admin')
  await page.getByRole('button', { name: /\+ פריט ידע חדש/ }).click()
  await page.getByPlaceholder('שם המאמר / המסמך...').fill(title)
  await page.getByPlaceholder('תקציר המאמר...').fill(content)
  if (file) await page.locator('input[type=file]').last().setInputFiles({ ...file, mimeType: 'application/pdf' })
  await page.getByRole('button', { name: 'שמור מסמך', exact: true }).click()
  await expect(page.getByText('הוסף פריט ידע חדש', { exact: true })).toBeHidden()
  const docs = await adminDb().collection('knowledge_articles').where('titleHe', '==', title).get()
  expect(docs.size).toBe(1)
  return docs.docs[0]
}

export async function storageFiles() {
  const [files] = await getStorage(adminApp()).bucket(`${PROJECT_ID}.appspot.com`).getFiles()
  return files.map((file) => file.name).sort()
}

/**
 * Fail real emulator writes, not an SDK method. Both WebChannel batches and
 * transaction Commit requests are covered so atomic writers remain testable.
 * A stale update-time precondition models a concurrent-write conflict. Neither
 * fields nor paths are changed, no failing write is committed, and the emulator
 * returns the actual FAILED_PRECONDITION through the real SDK to production.
 */
export async function conflictNextWrite(
  page: Page,
  matches: (path: string, fields: Record<string, unknown>) => boolean,
  beforeFailure: () => Promise<unknown>,
  options: { persistent?: boolean } = {},
) {
  const evidence: { injected: number; committedBeforeFailure?: unknown; path?: string } = { injected: 0 }
  let active = true
  const isEmulatorRequest = (url: string) => {
    const target = new URL(url)
    return ['localhost', '127.0.0.1'].includes(target.hostname) && target.port === String(EMULATORS.firestore.port)
  }
  type Write = {
    update?: { name: string; fields?: Record<string, unknown> }
    currentDocument?: unknown
  }
  const inject = async (writes: Write[] = []) => {
    if (!active || (!options.persistent && evidence.injected > 0)) return false
    for (const write of writes) {
      if (write.update && matches(write.update.name, write.update.fields ?? {})) {
        // Diagnostic snapshot only: an atomic writer may have committed nothing.
        if (evidence.injected === 0) evidence.committedBeforeFailure = await beforeFailure()
        evidence.path = write.update.name
        evidence.injected++
        write.currentDocument = { updateTime: '2000-01-01T00:00:00.000000Z' }
        return true
      }
    }
    return false
  }
  await page.route('**/google.firestore.v1.Firestore/Write/channel**', async (route) => {
    if (!isEmulatorRequest(route.request().url())) { await route.fallback(); return }
    const raw = route.request().postData()
    if (!raw) { await route.fallback(); return }
    const params = new URLSearchParams(raw)
    for (const [key, value] of params) {
      if (!key.endsWith('___data__')) continue
      const message = JSON.parse(value) as { writes?: Write[] }
      if (await inject(message.writes)) {
        params.set(key, JSON.stringify(message))
        await route.continue({ postData: params.toString() })
        return
      }
    }
    await route.fallback()
  })
  await page.route('**/documents:commit**', async (route) => {
    if (!isEmulatorRequest(route.request().url())) { await route.fallback(); return }
    const raw = route.request().postData()
    if (!raw) { await route.fallback(); return }
    const message = JSON.parse(raw) as { writes?: Write[] }
    if (await inject(message.writes)) {
      await route.continue({ postData: JSON.stringify(message) })
    } else await route.fallback()
  })
  return Object.assign(evidence, { release: () => { active = false } })
}
