import { expect, test } from '@playwright/test'

const toMinutes = (label: string | null): number => {
  const [h, m] = (label ?? '').split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

test('clock: starts locally, runs while flying, and freezes on pause', async ({ page }) => {
  // The standard cycle keeps the held local half hour stable long enough to assert before ticking.
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()

  const clock = page.getByTestId('clock-readout')
  const localHalfHour = await page.evaluate(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`
  })
  await expect(clock).toHaveText(localHalfHour)
  await expect(clock).not.toHaveText(localHalfHour, { timeout: 8000 })
  await page.screenshot({ path: 'test-results/94-clock.png' })

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pause-menu')).toBeVisible()
  const paused = await clock.textContent()
  await page.waitForTimeout(1500)
  await expect(clock).toHaveText(paused ?? '')

  expect(toMinutes(paused)).not.toBe(toMinutes(localHalfHour))
})

test('clock: ?time= pins it', async ({ page }) => {
  await page.goto('/?input=keyboard&cycle=20&time=21:30')
  await page.getByRole('button', { name: 'Start' }).click()
  const clock = page.getByTestId('clock-readout')
  await expect(clock).toHaveText('21:30')
  await page.waitForTimeout(1500)
  await expect(clock).toHaveText('21:30')
})
