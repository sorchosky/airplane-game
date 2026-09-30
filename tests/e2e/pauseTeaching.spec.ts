import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 960, height: 540 } })

for (const { timeOfDay, screenshot } of [
  { timeOfDay: 'day', screenshot: 'test-results/131-pause-teaching-day.png' },
  { timeOfDay: 'night', screenshot: 'test-results/131-pause-teaching-night.png' },
] as const) {
  test(`pause teaching is panel-free and completes the replay pause at ${timeOfDay}`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.goto(`/?input=replay&replay=first-run&fx=low&wings=off&tod=${timeOfDay}`)
    await page.getByRole('button', { name: 'Start' }).click()

    const teaching = page.getByTestId('pause-teaching')
    await expect(teaching).toHaveCSS('opacity', '1', { timeout: 60_000 })
    await expect(teaching).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(teaching).toHaveCSS('font-size', '24px')
    await expect(teaching).toHaveCSS('text-shadow', /rgba\(12, 18, 26, 0\.6\)/)
    await expect(teaching.locator('svg')).toHaveCSS('filter', /drop-shadow/)
    await expect(page.getByTestId('hud-prompt')).toHaveAttribute('data-prompt', 'none')
    await page.screenshot({ path: screenshot })

    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible({ timeout: 10_000 })
  })
}

test('pause teaching is absent and cannot gesture-pause mouse play', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?debug&fx=low')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Mouse' }).click()
  await page.waitForTimeout(5_500)
  await expect(page.getByTestId('pause-teaching')).toHaveCSS('opacity', '0')
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden()
})

test('reduced motion removes the teaching transition', async ({ page }) => {
  test.setTimeout(90_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?input=replay&replay=first-run&fx=low&wings=off')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('pause-teaching')).toHaveCSS('transition-duration', '0s')
})

test('high contrast alone restores an opaque teaching panel', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/?input=replay&replay=first-run&fx=low&wings=off&contrast')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('pause-teaching')).toHaveCSS('background-color', 'rgb(12, 18, 26)')
})
