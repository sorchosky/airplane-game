import { expect, test } from '@playwright/test'

test('title screen shows Start then control selection and camera calibration', async ({ page }) => {
  await page.goto('/')
  const start = page.getByRole('button', { name: 'Start' })
  await expect(start).toBeVisible()

  await start.click()
  await expect(page.getByTestId('control-select')).toBeVisible()
  await page.getByRole('button', { name: /Camera/ }).click()
  await expect(page.getByTestId('calibration-guidance')).toBeVisible()
})

test('desktop select offers mouse and keyboard fallback, then shows the menu after quitting', async ({
  page,
}) => {
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('button', { name: /Mouse/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Touch/ })).toHaveCount(0)
  await expect(page.getByTestId('title-handoff')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/control-select-desktop.png' })
  await page.getByRole('button', { name: /Mouse/ }).click()
  await expect(page.locator('canvas')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Quit to title' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('control-select')).toBeVisible()
})

test('coarse primary pointer offers touch and an on-screen pause button', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('button', { name: /Touch/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Mouse/ })).toHaveCount(0)
  await expect(page.getByTestId('title-handoff')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/control-select-touch.png' })
  await page.getByRole('button', { name: /Touch/ }).click()
  await page.getByRole('button', { name: 'Paused' }).click()
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
  await context.close()
})

test('?input=keyboard skips straight to the flight scene', async ({ page }) => {
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('canvas')).toBeVisible()
})
