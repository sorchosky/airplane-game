import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 960, height: 540 } })

test('first run practices in the live world and reaches flight in under a minute', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.goto('/?input=replay&replay=first-run&fx=low&wings=always')
  const startedAt = Date.now()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('calibration-guidance')).toBeVisible()
  await expect(page.getByTestId('wings-prompt')).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => page.evaluate(() => window.__driftwing?.snapshot().game), {
      timeout: 59_000,
    })
    .toBe('flying')
  await expect(page.getByTestId('wings-prompt')).toHaveCount(0)
  expect(Date.now() - startedAt).toBeLessThan(60_000)
})
