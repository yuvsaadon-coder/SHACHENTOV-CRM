import { expect, test, type Page } from '@playwright/test'

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

async function addProduct(page: Page, name: string, times: number) {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name: `הוסף ${name}`, exact: true }).click()
}

test('coordinator fills 4 baskets, submits, and the admin sees the vote and results', async ({ page }) => {
  const errors = trackConsoleErrors(page)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'שלום, איזה רכז את/ה?' })).toBeVisible()

  await page.getByRole('button', { name: 'לאה ליבנת' }).click()
  const submit = page.getByRole('button', { name: /הושלמו|שלח הצבעה/ })
  await expect(submit).toBeDisabled()

  // basket 2 is locked until basket 1 is valid
  await expect(page.getByRole('button', { name: /הרחבה לסל א'/ })).toBeDisabled()

  await addProduct(page, 'פסטה', 4)
  await addProduct(page, 'טונה', 4)
  await page.getByRole('button', { name: 'המשך לסל הבא ←' }).click()
  await addProduct(page, 'קפה', 1)
  await addProduct(page, 'ממרח שוקולד', 1)
  await page.getByRole('button', { name: 'המשך לסל הבא ←' }).click()
  await addProduct(page, 'חומוס', 4)
  await addProduct(page, 'ירקות', 1) // גילה can see veg
  await page.getByRole('button', { name: 'המשך לסל הבא ←' }).click()
  await addProduct(page, 'זיתים', 2)

  await expect(submit).toHaveText('שלח הצבעה ✓')
  await submit.click()
  await expect(page.getByRole('status').filter({ hasText: 'ההצבעה נשלחה' })).toBeVisible()

  // A branch that cannot see vegetables does not get the product
  await page.getByRole('button', { name: 'החלף' }).click()
  await page.getByRole('button', { name: 'יוחאי אבוטבול' }).click()
  await expect(page.getByRole('button', { name: 'הוסף ירקות', exact: true })).toHaveCount(0)

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'לוח אדמין' })).toBeVisible()
  await expect(page.getByText('1/14 הצביעו').first()).toBeVisible()
  await page.getByRole('tab', { name: 'תוצאות משוקללות' }).click()
  await expect(page.getByRole('cell', { name: /פסטה/ })).toBeVisible()
  await page.getByRole('tab', { name: '🏆 סל מומלץ' }).click()
  await expect(page.getByText('🧺 סל ראשי (ממוצע א׳+ב׳)')).toBeVisible()
  await page.getByRole('tab', { name: 'השוואת רכזים' }).click()
  await page.getByRole('tab', { name: 'ייצוא לספק' }).click()
  await expect(page.getByText(/רשימת קניות · \d+ מוצרים/)).toBeVisible()

  // no horizontal page overflow (RTL layout check)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('closing the round blocks coordinators; reset archives instead of deleting', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/admin')
  await page.evaluate(() => localStorage.setItem('shachen-tov-demo-votes', JSON.stringify({
    lea: { coordinatorId: 'lea', coordinatorName: 'לאה ליבנת', branch: 'גילה', submittedAt: 1, a: { pasta: 2 } },
  })))
  await page.reload()
  await expect(page.getByText('1/14 הצביעו').first()).toBeVisible()
  await page.getByRole('tab', { name: 'סבבים' }).click()
  await page.getByRole('button', { name: '🔒 סגור הצבעה' }).click()
  await expect(page.getByRole('button', { name: '🔓 פתח מחדש' })).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'לאה ליבנת' }).click()
  await expect(page.getByRole('heading', { name: 'ההצבעה סגורה' })).toBeVisible()

  await page.goto('/admin')
  await page.getByRole('tab', { name: 'סבבים' }).click()
  await page.getByRole('button', { name: '+ סבב חדש (#15)' }).click()
  await expect(page.getByText('סבב #15')).toBeVisible()
  await expect(page.getByText('🟢 פתוח')).toBeVisible()
  await expect(page.getByText('0/14 הצביעו').first()).toBeVisible()
  const archived = await page.evaluate(() => JSON.parse(localStorage.getItem('shachen-tov-demo-archived-votes') ?? '[]'))
  expect(archived).toHaveLength(1)
  expect(archived[0]).toMatchObject({ coordinatorId: 'lea', round: 14, archivedReason: 'פתיחת סבב חדש' })
})
