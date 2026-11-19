import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'

async function sampleXlsx(pastaPrice = 2.5): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('הצעה')
  ws.addRows([
    ['הצעת מחיר - ספק יבשים'],
    ['המחירים לפני מע"מ'],
    ['מק"ט', 'תיאור פריט', 'מחיר ליחידה', 'סה"כ'],
    ['1001', 'פסטה פנה 500 גרם', pastaPrice, 250],
    ['1002', 'דבש טהור 500 גרם', 15, 150],
  ])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function openQuotes(page: Page, pastaPrice = 2.5, goto = true) {
  if (goto) {
    page.on('dialog', (d) => void d.accept())
    await page.goto('/admin')
    await page.getByRole('tab', { name: 'הצעות מחיר' }).click()
  }
  await page.getByTestId('quote-file').setInputFiles({ name: 'quote.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await sampleXlsx(pastaPrice) })
  await expect(page.getByRole('list', { name: 'קבצים' }).getByText('quote.xlsx')).toBeVisible()
}

test('without AI: an Excel quote updates a price and adds a new product with an icon', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openQuotes(page)
  await page.getByRole('button', { name: '🔍 נתח הצעה' }).click()
  await expect(page.getByText(/נקראו בלי AI/)).toBeVisible()
  await expect(page.getByText('1 עדכוני מחיר · 1 מוצרים חדשים · 0 לתיעוד בלבד · 0 לא ייכנסו')).toBeVisible()
  // before-VAT price 2.50 -> 2.95 incl. VAT
  await expect(page.getByLabel('מחיר חדש: פסטה פנה 500 גרם')).toHaveValue('2.95')
  await expect(page.getByLabel('אייקון: דבש טהור 500 גרם')).toHaveValue('🍯')
  await page.getByLabel('שם המוצר החדש: דבש טהור 500 גרם').fill('דבש')
  await page.getByRole('button', { name: /החל 2 שינויים/ }).click()
  await expect(page.getByText(/✅ הקטלוג עודכן: 1 מחירים עודכנו, 1 מוצרים נוספו\. 2 מחירים נרשמו/)).toBeVisible()
  await expect(page.getByText('1 עודכנו · 1 נוספו')).toBeVisible()

  await page.getByRole('tab', { name: 'ניהול קטלוג' }).click()
  await expect(page.getByRole('row', { name: /פסטה.*2\.95/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /דבש.*17\.70/ })).toBeVisible()

  // coordinators see the new product
  await page.goto('/')
  await page.getByRole('button', { name: 'לאה ליבנת' }).click()
  await expect(page.getByRole('button', { name: 'הוסף דבש', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('with AI: lines from the analysis are shown with notes and can be overridden', async ({ page }) => {
  let calls = 0
  await page.route('**/.netlify/functions/analyze-quote', async (route) => {
    calls++
    const body = route.request().postDataJSON() as { text: string; catalog: unknown[] }
    expect(body.text).toContain('פסטה פנה 500 גרם')
    expect(body.catalog.length).toBe(31)
    await route.fulfill({ json: { lines: [
      { name: 'פסטה פנה 500 גרם', unitPrice: 2.5, vatIncluded: false, matchId: 'pasta', emoji: '🍝', cat: 'dry', confidence: 0.95, note: '' },
      { name: 'דבש טהור 500 גרם', unitPrice: 15, vatIncluded: false, matchId: null, emoji: '🍯', cat: 'dry', confidence: 0.5, note: 'מחיר לצנצנת' },
    ] } })
  })
  await openQuotes(page)
  await page.getByRole('button', { name: '🔍 נתח הצעה' }).click()
  await expect(page.getByText('מחיר לצנצנת')).toBeVisible()
  await expect(page.getByText('⚠ כדאי לבדוק')).toBeVisible()
  await expect(page.getByText(/נקראו בלי AI/)).toHaveCount(0)
  // switch VAT handling during review: prices recalculated
  await page.getByLabel('מע"מ במחירי ההצעה').selectOption('included')
  await expect(page.getByLabel('מחיר חדש: פסטה פנה 500 גרם')).toHaveValue('2.5')
  await page.getByLabel('פעולה: דבש טהור 500 גרם').selectOption('ignore')
  await page.getByRole('button', { name: /החל 1 שינויים/ }).click()
  await expect(page.getByText(/✅ הקטלוג עודכן: 1 מחירים עודכנו, 0 מוצרים נוספו\. 1 מחירים נרשמו/)).toBeVisible()
  expect(calls).toBe(1)
})

test('price tracking: history from the spreadsheet, and the cheapest of two quotes wins', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'מעקב מחירים' }).click()
  await expect(page.getByRole('heading', { name: 'מעקב מחירים רב שנתי' })).toBeVisible()
  await expect(page.getByText('לפי 25 מוצרים שסופקו בשתי ההזמנות')).toBeVisible()
  await expect(page.getByRole('img', { name: /מדד המחירים מ-יולי 2023/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /ינואר 2025.*ברוכים/ })).toBeVisible()

  // quote 1 (supplier A): pasta 2.50 before VAT -> 2.95
  await page.getByRole('tab', { name: 'הצעות מחיר' }).click()
  await openQuotes(page, 2.5, false)
  await page.getByRole('button', { name: '🔍 נתח הצעה' }).click()
  await page.getByRole('button', { name: /החל \d+ שינויים/ }).click()
  await expect(page.getByText(/הקטלוג עודכן/)).toBeVisible()

  // quote 2 (another supplier): pasta more expensive -> record only, catalog keeps 2.95
  await page.getByRole('button', { name: 'הצעה חדשה' }).click()
  await page.getByRole('combobox', { name: /^ספק/ }).selectOption({ label: 'ספק אחר' })
  await page.getByLabel('שם הספק').fill('ספק יקר')
  await openQuotes(page, 3.0, false)
  await page.getByRole('button', { name: '🔍 נתח הצעה' }).click()
  await expect(page.getByText(/כבר התקבל מחיר זול יותר: ‏?2\.95/)).toBeVisible()
  await expect(page.getByLabel('פעולה: פסטה פנה 500 גרם')).toHaveValue('record')
  await page.getByLabel('פעולה: דבש טהור 500 גרם').selectOption('ignore')
  await page.getByRole('button', { name: /החל 1 שינויים/ }).click()
  await expect(page.getByText(/0 מחירים עודכנו, 0 מוצרים נוספו\. 1 מחירים נרשמו/)).toBeVisible()

  await page.getByRole('tab', { name: 'ניהול קטלוג' }).click()
  await expect(page.getByRole('row', { name: /פסטה.*2\.95/ })).toBeVisible()

  await page.getByRole('tab', { name: 'מעקב מחירים' }).click()
  const pastaRow = page.getByRole('row').filter({ hasText: /^🍝פסטה/ })
  await expect(page.getByRole('columnheader', { name: /נאספות הצעות/ })).toBeVisible()
  await expect(pastaRow.getByRole('cell').last()).toContainText('2.95')
  await expect(pastaRow.getByRole('cell').last()).toHaveAttribute('title', /הזול ביותר: ספק יבשים · 2 הצעות/)
})
