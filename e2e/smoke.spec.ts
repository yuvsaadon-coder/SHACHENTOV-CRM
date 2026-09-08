import { test, expect } from '@playwright/test'

test('login page renders with RTL content', async ({ page }) => {
  await page.goto('/')
  // The page should load without a network error
  await expect(page).not.toHaveURL(/error/)
  // Hebrew text should be present (login form or main app)
  const body = await page.locator('body').textContent()
  // The app is in Hebrew; verify some Hebrew characters appear
  expect(body).toMatch(/[֐-׿]/)
})

test('page has RTL direction set', async ({ page }) => {
  await page.goto('/')
  // At least one element should have dir="rtl" or the html element
  const rtlEl = await page.locator('[dir="rtl"], [dir="RTL"]').first()
  await expect(rtlEl).toBeVisible()
})
