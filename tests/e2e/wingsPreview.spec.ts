import { expect, test } from '@playwright/test'

// The camera preview stays live from calibration through wings practice into flight (#197). The
// calibrate frame's preview unmounts after its exit, once the wings preview has taken the video.
// A replay has no camera stream, so this checks placement; `fakeCameraClip` checks live pixels.

test.use({ viewport: { width: 960, height: 540 } })

test('the corner preview holds a visible video through wings practice into flight', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.goto('/?input=replay&replay=first-run&fx=low&wings=always')
  // Record whether the corner preview contracts in from the calibrate frame (lock-in, #63).
  await page.evaluate(() => {
    const seen = { contract: false }
    Object.assign(window, { __lockIn: seen })
    const observer = new MutationObserver(() => {
      const previews = document.querySelectorAll('[data-testid="camera-preview"]')
      for (const preview of previews) {
        if (preview.closest('[data-front-door]')) continue
        if (preview.getAnimations().length > 0) seen.contract = true
        observer.disconnect()
      }
    })
    observer.observe(document.body, { subtree: true, childList: true })
  })
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('calibration-guidance')).toBeVisible()
  await expect(page.getByTestId('wings-prompt')).toBeVisible({ timeout: 30_000 })

  const preview = page.getByTestId('camera-preview')
  // Only the corner preview is left once the calibrate frame's exit is over.
  await expect(preview).toHaveCount(1)
  await expect(preview.locator('video')).toBeVisible()
  await expect(preview.locator('video')).toHaveCSS('opacity', '1')
  expect(
    await page.evaluate(() => (window as unknown as { __lockIn: { contract: boolean } }).__lockIn),
  ).toEqual({ contract: true })

  // Still in a preview on every frame of every hint until flight, and then in the HUD's preview.
  const blankFrames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let blank = 0
        const tick = () => {
          const game = window.__driftwing?.snapshot().game
          if (game === 'flying') return resolve(blank)
          if (!document.querySelector('[data-testid="camera-preview"] > video')) blank += 1
          requestAnimationFrame(tick)
        }
        tick()
      }),
  )
  expect(blankFrames).toBe(0)
  await expect(preview.locator('video')).toBeVisible()
})
