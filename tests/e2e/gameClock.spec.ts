import { expect, test } from '@playwright/test'

const toMinutes = (label: string | null): number => {
  const [h, m] = (label ?? '').split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

test('clock: runs while flying, freezes on pause, resumes after a reload', async ({ page }) => {
  // A 20 s day: each half hour lasts about 0.4 s.
  await page.goto('/?input=keyboard&cycle=20')
  await page.getByRole('button', { name: 'Start' }).click()

  const clock = page.getByTestId('clock-readout')
  await expect(clock).toHaveText('07:00')
  await expect(clock).not.toHaveText('07:00', { timeout: 5000 })
  await page.screenshot({ path: 'test-results/94-clock.png' })

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pause-menu')).toBeVisible()
  const paused = await clock.textContent()
  await page.waitForTimeout(1500)
  await expect(clock).toHaveText(paused ?? '')

  await page.reload()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(clock).toHaveText(paused ?? '')
  expect(toMinutes(paused)).not.toBe(7 * 60)
})

test('clock: ?time= pins it', async ({ page }) => {
  await page.goto('/?input=keyboard&cycle=20&time=21:30')
  await page.getByRole('button', { name: 'Start' }).click()
  const clock = page.getByTestId('clock-readout')
  await expect(clock).toHaveText('21:30')
  await page.waitForTimeout(1500)
  await expect(clock).toHaveText('21:30')
})
