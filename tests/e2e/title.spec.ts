import { expect, test } from '@playwright/test'

test('title screen shows Start and tapping it reaches calibrate', async ({ page }) => {
  await page.goto('/')
  const start = page.getByRole('button', { name: 'Start' })
  await expect(start).toBeVisible()

  await start.click()
  await expect(page.getByText('Step back so your whole upper body is visible.')).toBeVisible()
})

test('?input=keyboard skips straight to the flight scene', async ({ page }) => {
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('canvas')).toBeVisible()
})
