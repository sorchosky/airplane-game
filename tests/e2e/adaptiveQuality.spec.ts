import { expect, test } from '@playwright/test'

// The frame-time governor (#65). `?budget=1` sets a 1 ms p95 target no machine meets, so the
// governor must walk down its ladder one rung at a time; `?fx=` pins the tier and turns it off.

test('an impossible budget walks the quality ladder down', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/?input=keyboard&debug&budget=1')
  await page.getByRole('button', { name: 'Start' }).click()
  const hud = page.getByTestId('perf-hud')
  await expect(hud).toContainText('rung 1/')
  await expect(hud).toContainText(/rung [4-9]\/\d+ {2}↓ /, { timeout: 60_000 })
  await page.screenshot({ path: 'test-results/65-governor-stepped-down.png' })
})

test('?fx= pins the tier and keeps the governor off', async ({ page }) => {
  await page.goto('/?input=keyboard&debug&budget=1&fx=high')
  await page.getByRole('button', { name: 'Start' }).click()
  const hud = page.getByTestId('perf-hud')
  await expect(hud).toContainText('rung pinned by ?fx')
  await page.waitForTimeout(8000)
  await expect(hud).toContainText('high')
  await expect(hud).toContainText('rung pinned by ?fx')
})

// Cast mode (#27): `?cast` draws at 30 fps at most, so the screen mirror's encoder has headroom.
test('?cast keeps rendering and never exceeds 30 fps', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?input=keyboard&debug&cast&fx=low')
  await page.getByRole('button', { name: 'Start' }).click()
  const hud = page.getByTestId('perf-hud')
  await expect(hud).toContainText(/\b[1-9]\d* fps/, { timeout: 30_000 })
  await page.waitForTimeout(4000)
  const fps = Number((await hud.textContent())?.match(/(\d+) fps/)?.[1])
  // Software GL under parallel workers can stall for a second, so only the ceiling is asserted.
  expect(fps).toBeLessThanOrEqual(31)
  expect(errors).toEqual([])
})
