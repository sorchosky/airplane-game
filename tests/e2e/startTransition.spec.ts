import { expect, test, type Page } from '@playwright/test'

// Start → Choose (#159). The timeline is pinned through `window.__startTimeline` (under `?debug`),
// so each frame is a fixed point on the clock rather than a race against the animation.

const FRAMES_MS = [0, 300, 600, 900, 1200]

async function pin(page: Page, ms: number) {
  await page.evaluate((t) => window.__startTimeline?.pin(t), ms)
}

const opacityOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => Number(getComputedStyle(el).opacity))

// Software GL in CI and cloud sessions boots the world slowly.
test.setTimeout(120_000)
test.use({ viewport: { width: 1920, height: 1080 } })

test('Start plays the masthead into the Choose beat on one clock, with screenshots', async ({
  page,
}) => {
  await page.goto('/?debug')
  await expect(page.getByTestId('world')).toHaveAttribute('data-world-status', 'ready', {
    timeout: 60_000,
  })
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForFunction(() => window.__startTimeline?.time() != null)

  for (const ms of FRAMES_MS) {
    await pin(page, ms)
    // Let the held frame draw so the lean and blur are in the capture.
    await page.waitForTimeout(250)
    await page.screenshot({ path: `docs/screenshots/159-start-${String(ms).padStart(4, '0')}.png` })
    if (ms === 0) {
      expect(await page.evaluate(() => window.__startTimeline?.look())).toEqual({
        lean: 0,
        blur: 0,
      })
      expect(await opacityOf(page, '[data-shared-element="start"]')).toBe(1)
    }
    if (ms === 300) {
      expect(await opacityOf(page, '[data-shared-element="start"]')).toBe(0)
      expect(await opacityOf(page, '[data-shared-element="rule"]')).toBe(0)
    }
    if (ms === 900) {
      const look = await page.evaluate(() => window.__startTimeline?.look())
      expect(look?.lean).toBe(1)
      expect(look?.blur).toBe(1)
    }
  }

  // The wordmark has become the running head: smaller, at 70 %, at the top left.
  expect(await opacityOf(page, '[data-shared-element="wordmark"]')).toBeCloseTo(0.7, 1)
  const box = await page.locator('[data-shared-element="wordmark"]').boundingBox()
  expect(box?.y).toBeLessThan(80)
  await expect(page.locator('.control-title')).toHaveCSS('opacity', '1')
  // Nothing under the control choice is tappable but the choice itself.
  expect(
    await page
      .getByRole('button', { name: 'Start' })
      .evaluate((el) => el.closest('[inert]') !== null),
  ).toBe(true)
})

test('Escape reverses the timeline back to the settled masthead', async ({ page }) => {
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForFunction(() => window.__startTimeline?.time() != null)
  await pin(page, 1200)
  await page.evaluate(() => window.__startTimeline?.release())
  await page.waitForFunction(
    () => document.querySelector('[data-beat]')?.getAttribute('data-beat') === 'choose',
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-beat]').first()).toHaveAttribute('data-beat', 'masthead')
  const start = page.getByRole('button', { name: 'Start' })
  await expect(start).toBeVisible()
  await expect.poll(() => opacityOf(page, '[data-shared-element="start"]')).toBe(1)
  expect(await page.evaluate(() => window.__startTimeline?.look())).toEqual({ lean: 0, blur: 0 })
})

test('the low tier holds the world on a CSS-blurred still, never a backdrop filter', async ({
  page,
}) => {
  await page.goto('/?debug&fx=low')
  await expect(page.getByTestId('world')).toHaveAttribute('data-world-status', 'ready', {
    timeout: 60_000,
  })
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForFunction(() => window.__startTimeline?.time() != null)
  await pin(page, 1200)
  const still = page.getByTestId('world-still')
  await expect.poll(() => still.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1)
  await expect(still.locator('canvas')).toHaveCSS('filter', /blur/)
  const backdrop = await page.evaluate(
    () =>
      [...document.querySelectorAll('*')].filter(
        (el) => getComputedStyle(el).backdropFilter !== 'none',
      ).length,
  )
  expect(backdrop).toBe(0)
  await page.waitForTimeout(250)
  await page.screenshot({ path: 'docs/screenshots/159-start-low-1200.png' })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('crossfades with a static blur and the running head already in place', async ({ page }) => {
    await page.goto('/?debug')
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByTestId('control-select')).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => window.__startTimeline?.look()))
      .toEqual({
        lean: 1,
        blur: 1,
      })
    expect(await opacityOf(page, '[data-shared-element="wordmark"]')).toBeCloseTo(0.7, 1)
  })
})
