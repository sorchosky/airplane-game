import { expect, test } from '@playwright/test'

// Stub e2e test. Fixtures and fake-camera setup land in #19.
test('the app loads and renders a canvas', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
})
