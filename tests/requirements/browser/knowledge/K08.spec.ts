import { test, expect } from '@playwright/test'
import { handler } from '../../../../netlify/functions/summarize-article'
import { invoke, makeEvent } from '../../support/knowledge-netlify-handler'
import { prepareKnowledge, cleanupKnowledge, showKnowledge } from '../../support/knowledge-browser'

// The selected attachment, not the editable "תקציר" output field, is the source.
const sentinel = 'DOCUMENT_FACT_THE_DISTRIBUTION_IS_ON_TUESDAY'
function pdfFixture(text: string) {
  const stream = `BT /F1 10 Tf 10 200 Td (${text}) Tj ET\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let content = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(content))
    content += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(content)
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  content += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(content)
}
const document = pdfFixture(sentinel)

test.beforeEach(async ({ page }) => { await prepareKnowledge(page) })
test.afterEach(async ({ page }, info) => { await cleanupKnowledge(page, info) })

for (const [id, classification] of [['current-title-only-request', 'C'], ['document-content-grounding', 'G']]) {
  test(`TEST-K08.${id} (${classification})`, async ({ page }, info) => {
    const original = globalThis.fetch
    const provider: unknown[] = []
    const requests: unknown[] = []
    globalThis.fetch = (async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url === 'https://api.anthropic.com/v1/messages') {
        provider.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'סיכום בדיקה בלבד' }] }))
      }
      if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('External request blocked')
      return original(input, init)
    }) as typeof fetch
    try {
      await page.route('**/.netlify/functions/summarize-article', async (route) => {
        const request = route.request()
        requests.push(request.postDataJSON())
        const response = await invoke(handler, makeEvent({
          httpMethod: request.method(), headers: await request.allHeaders(), body: request.postData(),
        }))
        await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body ?? '' })
      })
      await showKnowledge(page, 'research-admin')
      await page.getByRole('button', { name: /\+ פריט ידע חדש/ }).click()
      await page.getByPlaceholder('שם המאמר / המסמך...').fill('מסמך תפעול סינתטי')
      await page.locator('input[type=file]').last().setInputFiles({
        name: 'operations.pdf', mimeType: 'application/pdf', buffer: document,
      })
      await expect(page.getByText('operations.pdf', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: /AI סיכום/ }).click()
      await expect(page.getByPlaceholder('תקציר המאמר...')).toHaveValue('סיכום בדיקה בלבד')
      expect(provider).toHaveLength(1)
      await info.attach('summary-evidence', { body: JSON.stringify({ requests, provider }), contentType: 'application/json' })
      if (classification === 'C') {
        expect(requests).toEqual([{ title: 'מסמך תפעול סינתטי' }])
      } else {
        // Accept extracted text or the actual attached document supplied inline;
        // a title is neither. No assertion about the canned answer's semantics.
        const evidence = JSON.stringify(provider)
        expect(evidence.includes(sentinel) || evidence.includes(document.toString('base64'))).toBe(true)
      }
    } finally { globalThis.fetch = original }
  })
}
