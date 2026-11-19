import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'

async function sampleXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('הצעה')
  ws.addRows([
    ['הצעת מחיר - ספק יבשים'],
    ['המחירים לפני מע"מ'],
    ['מק"ט', 'תיאור פריט', 'מחיר ליחידה', 'סה"כ'],
    ['1001', 'פסטה פנה 500 גרם', 2.5, 250],
    ['1002', 'דבש טהור 500 גרם', 15, 150],
  ])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function openQuotes(page: Page) {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'הצעות מחיר' }).click()
  await page.getByTestId('quote-file').setInputFiles({ name: 'quote.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await sampleXlsx() })
  await expect(page.getByText('quote.xlsx')).toBeVisible()
}

test('without AI: an Excel quote updates a price and adds a new product with an icon', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openQuotes(page)
  await page.getByRole('button', { name: '🔍 נתח הצעה' }).click()
  await expect(page.getByText(/נקראו בלי AI/)).toBeVisible()
  await expect(page.getByText('1 עדכוני מחיר · 1 מוצרים חדשים · 0 לא ייכנסו')).toBeVisible()
  // before-VAT price 2.50 -> 2.95 incl. VAT
  await expect(page.getByLabel('מחיר חדש: פסטה פנה 500 גרם')).toHaveValue('2.95')
  await expect(page.getByLabel('אייקון: דבש טהור 500 גרם')).toHaveValue('🍯')
  await page.getByLabel('שם המוצר החדש: דבש טהור 500 גרם').fill('דבש')
  await page.getByRole('button', { name: /החל 2 שינויים/ }).click()
  await expect(page.getByText('✅ הקטלוג עודכן: 1 מחירים עודכנו, 1 מוצרים נוספו.')).toBeVisible()
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
  await expect(page.getByText('✅ הקטלוג עודכן: 1 מחירים עודכנו, 0 מוצרים נוספו.')).toBeVisible()
  expect(calls).toBe(1)
})
