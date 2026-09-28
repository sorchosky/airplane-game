import { expect, test } from '@playwright/test'

test('mouse steers without clicking, keys override each axis, and leaving disengages', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Mouse' }).click()
  await expect(page.getByTestId('mouse-reticle')).toBeVisible()
  const { width, height } = page.viewportSize()!
  await page.mouse.move(width / 2 + height * 0.15, height / 2 - height * 0.15)
  const input = () => page.evaluate(() => window.__driftwing?.snapshot().input)
  await expect.poll(async () => (await input())?.roll).toBeGreaterThan(0.2)
  await expect.poll(async () => (await input())?.pitch).toBeGreaterThan(0.2)
  expect((await input())?.active).toBe(true)
  await page.keyboard.down('a')
  await expect.poll(async () => (await input())?.roll).toBeLessThan(-0.5)
  expect((await input())?.pitch).toBeGreaterThan(0)
  await page.keyboard.up('a')
  await page.mouse.move(-20, -20)
  await expect.poll(async () => (await input())?.active).toBe(false)
  await page.keyboard.down('d')
  await expect.poll(async () => (await input())?.active).toBe(true)
  await expect.poll(async () => (await input())?.roll).toBeGreaterThan(0.5)
  await page.keyboard.up('d')
  await expect.poll(async () => (await input())?.active).toBe(false)
  expect(await page.evaluate(() => window.__driftwing?.snapshot().game)).toBe('flying')
})
