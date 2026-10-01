import { expect, test, type Page } from '@playwright/test'

// Choose → Position (#160). The timeline is pinned through `window.__positionTimeline` (under
// `?debug`), so each frame is a fixed point on the clock rather than a race against the animation.

const FRAMES_MS = [0, 200, 550, 900, 1200]
const SIZES = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '844x390', width: 844, height: 390 },
]

// Software GL in CI and cloud sessions boots the world slowly.
test.setTimeout(120_000)

async function toChoose(page: Page) {
  // A camera prompt that never resolves holds the beat at the camera ask.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>(() => undefined)
  })
  await page.goto('/?debug&fx=low')
  await expect(page.getByTestId('world')).toHaveAttribute('data-world-status', 'ready', {
    timeout: 60_000,
  })
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForFunction(() => window.__startTimeline?.time() != null)
  await page.evaluate(() => window.__startTimeline?.pin(1200))
}

const pin = (page: Page, ms: number) => page.evaluate((t) => window.__positionTimeline?.pin(t), ms)

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('Motion opens into the calibration frame, with screenshots', async ({ page }) => {
      await toChoose(page)
      await page.getByRole('button', { name: /Motion/ }).click()
      await page.waitForFunction(() => window.__positionTimeline?.time() != null)

      for (const ms of FRAMES_MS) {
        await pin(page, ms)
        await page.waitForTimeout(250)
        await page.screenshot({ path: `test-results/160-position-${size.name}-${ms}.png` })
      }

      // Settled: the camera ask sits in the frame, and the running head is still top left.
      await expect(page.getByTestId('camera-ask')).toContainText('Prop your phone up')
      const frame = await page.getByTestId('camera-preview').boundingBox()
      expect(frame).not.toBeNull()
      expect(frame!.width / frame!.height).toBeCloseTo(4 / 3, 1)

      // The Motion frame's marks have landed on the calibration frame's corners.
      const marks = await page.locator('.control-frame[data-mode="camera"] .control-corner').all()
      const tl = await marks[0]!.boundingBox()
      // (Inside the frame's 1 px border.)
      expect(Math.abs(tl!.x - frame!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(tl!.y - frame!.y)).toBeLessThanOrEqual(1)

      // The touch frame and header are gone, the glyph crossfaded out, the target is up.
      const opacity = (selector: string) =>
        page
          .locator(selector)
          .first()
          .evaluate((el) => Number(getComputedStyle(el).opacity))
      expect(await opacity('.control-title')).toBe(0)
      expect(await opacity('.control-frame[data-mode="camera"] .control-glyph-box')).toBe(0)
      expect(await opacity('[data-testid="camera-preview"] canvas')).toBe(1)
    })
  })
}

test.describe('back', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('Escape from calibration reverses to the Choose beat', async ({ page }) => {
    await toChoose(page)
    await page.getByRole('button', { name: /Motion/ }).click()
    await expect(page.getByTestId('camera-ask')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('camera-preview')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Motion/ })).toBeVisible()
    await expect
      .poll(() =>
        page
          .locator('.control-title')
          .first()
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBe(1)
    await expect(page.getByRole('button', { name: /Motion/ })).toBeFocused()
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1920, height: 1080 } })

  test('crossfades straight to the settled calibration frame', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>(() => undefined)
    })
    await page.goto('/?fx=low')
    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByRole('button', { name: /Motion/ }).click()
    await expect(page.getByTestId('camera-ask')).toBeVisible()
    await expect(page.getByTestId('camera-preview')).toBeVisible()
  })
})
