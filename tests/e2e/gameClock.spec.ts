import { expect, test } from '@playwright/test'

/** Mirrors `STORAGE_KEY` in `src/world/gameClock.ts`. */
const CLOCK_STORAGE_KEY = 'skyborne.clock.minutes'

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

  // The save is what carries the time across the reload. Check it on the title, where the clock
  // is frozen: once flying again it moves on every ~0.4 s, too fast to compare exactly on CI.
  await page.reload()
  const saved = await page.evaluate((key) => Number(localStorage.getItem(key)), CLOCK_STORAGE_KEY)
  expect(Math.floor(saved / 30) * 30).toBe(toMinutes(paused))

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(clock).toBeVisible()
  const resumed = toMinutes(await clock.textContent())
  expect(resumed).toBeGreaterThanOrEqual(toMinutes(paused))
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
