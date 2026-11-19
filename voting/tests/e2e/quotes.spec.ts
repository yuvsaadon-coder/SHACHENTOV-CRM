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

async function gotoQuotes(page: Page) {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'הצעות מחיר' }).click()
}

async function uploadQuote(page: Page, supplier: string, pastaPrice = 2.5) {
  await page.getByLabel('שם הספק').fill(supplier)
  await page.getByTestId('quote-file').setInputFiles({ name: 'quote.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await sampleXlsx(pastaPrice) })
  await expect(page.getByRole('list', { name: 'קבצים' }).getByText('quote.xlsx')).toBeVisible()
  await page.getByRole('button', { name: '🔍 נתח הצעה' }).click()
}

test('without AI: save a quote (catalog unchanged), then choose the supplier (catalog + survey updated)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await gotoQuotes(page)
  await uploadQuote(page, 'ברוכים')
  await expect(page.getByText(/נקראו בלי AI/)).toBeVisible()
  await expect(page.getByText('1 מוצרים מהקטלוג · 1 מוצרים חדשים · 0 לא ייכנסו')).toBeVisible()
  await expect(page.getByLabel('מחיר בהצעה: פסטה פנה 500 גרם')).toHaveValue('2.95')   // 2.50 + 18% VAT
  await expect(page.getByLabel('אייקון: דבש טהור 500 גרם')).toHaveValue('🍯')
  await page.getByLabel('שם המוצר החדש: דבש טהור 500 גרם').fill('דבש')
  await page.getByRole('button', { name: /שמור את ההצעה של ברוכים/ }).click()
  await expect(page.getByText(/ההצעה של ברוכים נשמרה\. הקטלוג עוד לא השתנה/)).toBeVisible()

  // catalog is still the old price
  await page.getByRole('tab', { name: 'ניהול קטלוג' }).click()
  await expect(page.getByRole('row', { name: /פסטה.*2\.60/ })).toBeVisible()

  await page.getByRole('tab', { name: 'הצעות מחיר' }).click()
  const choice = page.locator('.card', { hasText: '3. בחירת ספק' })
  await expect(choice.getByText('הזול ביותר', { exact: true })).toBeVisible()
  await choice.getByRole('button', { name: 'בחר ספק זה' }).click()
  await expect(page.getByText(/נבחר ברוכים\. 1 מחירים עודכנו בקטלוג, 1 מוצרים חדשים נוספו/)).toBeVisible()
  await expect(page.getByText(/לא בהצעה של הספק שנבחר/)).toBeVisible()

  await page.getByRole('tab', { name: 'ניהול קטלוג' }).click()
  await expect(page.getByRole('row', { name: /פסטה.*2\.95/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /דבש.*17\.70/ })).toBeVisible()
  await page.goto('/')
  await page.getByRole('button', { name: 'לאה ליבנת' }).click()
  await expect(page.getByRole('button', { name: 'הוסף דבש', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('with AI: lines from the analysis are shown with notes and can be overridden', async ({ page }) => {
  let calls = 0
  await page.route('**/.netlify/functions/analyze-quote', async (route) => {
    calls++
    const body = route.request().postDataJSON() as { text: string; catalog: unknown[]; supplierName: string }
    expect(body.text).toContain('פסטה פנה 500 גרם')
    expect(body.supplierName).toBe('ברוכים')
    expect(body.catalog.length).toBe(31)
    await route.fulfill({ json: { lines: [
      { name: 'פסטה פנה 500 גרם', unitPrice: 2.5, vatIncluded: false, matchId: 'pasta', emoji: '🍝', cat: 'dry', confidence: 0.95, note: '' },
      { name: 'דבש טהור 500 גרם', unitPrice: 15, vatIncluded: false, matchId: null, emoji: '🍯', cat: 'dry', confidence: 0.5, note: 'מחיר לצנצנת' },
    ] } })
  })
  await gotoQuotes(page)
  await uploadQuote(page, 'ברוכים')
  await expect(page.getByText('מחיר לצנצנת')).toBeVisible()
  await expect(page.getByText('⚠ כדאי לבדוק')).toBeVisible()
  await expect(page.getByText(/נקראו בלי AI/)).toHaveCount(0)
  await page.getByLabel('מע"מ במחירי ההצעה').selectOption('included')
  await expect(page.getByLabel('מחיר בהצעה: פסטה פנה 500 גרם')).toHaveValue('2.5')
  await page.getByLabel('פעולה: דבש טהור 500 גרם').selectOption('ignore')
  await page.getByRole('button', { name: /שמור את ההצעה של ברוכים \(1 מוצרים\)/ }).click()
  await expect(page.getByText(/ההצעה של ברוכים נשמרה/)).toBeVisible()
  expect(calls).toBe(1)
})

test('two suppliers: compared on the same basket, the chosen one sets the prices; a discount shows only as "actual price"', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'מעקב מחירים' }).click()
  await expect(page.getByText('לפי 25 מוצרים שסופקו בשתי ההזמנות')).toBeVisible()
  await expect(page.getByRole('img', { name: /מדד המחירים מ-יולי 2023/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /ינואר 2025.*ברוכים/ })).toBeVisible()

  await page.getByRole('tab', { name: 'הצעות מחיר' }).click()
  page.on('dialog', (d) => void d.accept())
  await uploadQuote(page, 'ברוכים', 2.5)
  await page.getByRole('button', { name: /שמור את ההצעה/ }).click()
  await page.getByRole('button', { name: 'הצעה נוספת' }).click()
  await uploadQuote(page, 'אריזות', 3.0)
  await page.getByRole('button', { name: /שמור את ההצעה/ }).click()

  const choice = page.locator('.card', { hasText: '3. בחירת ספק' })
  await expect(choice.getByText(/ההשוואה על אותו סל: 1 מתוך/)).toBeVisible()
  const rows = choice.getByRole('row')
  await expect(rows.nth(1)).toContainText('ברוכים')
  await expect(rows.nth(1)).toContainText('הזול ביותר')
  await expect(rows.nth(2)).toContainText('אריזות')
  await expect(rows.nth(2)).toContainText('▲ 20.0%')

  // before choosing: tracker shows the cheapest provisionally
  await page.getByRole('tab', { name: 'מעקב מחירים' }).click()
  await expect(page.getByRole('columnheader', { name: /ינואר 2027.*ברוכים.*טרם נבחר ספק/ })).toBeVisible()

  await page.getByRole('tab', { name: 'הצעות מחיר' }).click()
  await rows.nth(1).getByRole('button', { name: 'בחר ספק זה' }).click()
  await expect(rows.nth(1)).toContainText('✓ נבחר')

  const disc = page.locator('.card', { hasText: '4. הנחה על ההזמנה' })
  await disc.getByLabel('סוג ההנחה').selectOption('amount')
  await disc.getByLabel('גובה ההנחה').fill('500')
  await disc.getByLabel('סך ההזמנה לפני ההנחה (₪)').fill('10000')
  await expect(disc.getByText(/שיעור הנחה בפועל: 5\.00%/)).toBeVisible()
  await disc.getByRole('button', { name: '💾 שמור הנחה' }).click()
  await expect(disc.getByText('✅ ההנחה נשמרה.')).toBeVisible()

  // catalog / survey stay on the list price
  await page.getByRole('tab', { name: 'ניהול קטלוג' }).click()
  await expect(page.getByRole('row', { name: /פסטה.*2\.95/ })).toBeVisible()

  await page.getByRole('tab', { name: 'מעקב מחירים' }).click()
  const pastaRow = page.getByRole('row').filter({ hasText: /^🍝פסטה/ })
  await expect(page.getByRole('columnheader', { name: /טרם נבחר ספק/ })).toHaveCount(0)
  await expect(pastaRow.getByRole('cell').last()).toContainText('2.95')
  await expect(pastaRow.getByRole('cell').last()).toHaveAttribute('title', /ספק: ברוכים · 2 הצעות/)
  await page.getByRole('button', { name: 'מחיר בפועל (אחרי הנחות)' }).click()
  await expect(pastaRow.getByRole('cell').last()).toContainText('2.80')        // 2.95 − 5%
  await expect(page.getByRole('columnheader', { name: /ינואר 2027.*הנחה 5\.0%/ })).toBeVisible()
  await page.getByRole('button', { name: 'מחירון (הצעת הספק)' }).click()
  await expect(pastaRow.getByRole('cell').last()).toContainText('2.95')
})
