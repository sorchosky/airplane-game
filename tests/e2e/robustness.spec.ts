import { expect, test } from '@playwright/test'

// Failure states (#61). The fake camera can't calibrate (no person in its test pattern), so the
// camera-loss case runs on the calibrate screen; in flight the same `lost` status drives the HUD
// prompt through the control machine (unit tested in controlStateMachine.test.ts).

test('camera track ending shows "Lost the camera" and recovers by itself', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start' }).click()
  const guidance = page.getByTestId('calibration-guidance')
  await expect(guidance).toBeVisible()
  // Playing, so the camera service has reported the stream live.
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.paused === false))
    .toBe(true)

  // `track.stop()` doesn't fire `ended` on the page's own track, so dispatch it as the browser
  // would when the camera is taken away.
  const firstTrackId = await page.evaluate(() => {
    const stream = document.querySelector('video')?.srcObject as MediaStream
    const track = stream.getVideoTracks()[0]
    track?.dispatchEvent(new Event('ended'))
    return track?.id
  })
  await expect(guidance).toHaveAttribute('data-phase', 'cameraLost')
  await expect(guidance).toHaveText('Lost the camera. Reconnecting…')
  await expect(page.getByTestId('camera-preview')).toHaveAttribute('data-camera-lost', 'true')
  await page.screenshot({ path: 'test-results/61-camera-lost.png' })

  // The first retry is 1 s out, but the model initialising on software GL can hold the main
  // thread for several seconds in CI, so allow well beyond the backoff.
  await expect(guidance).not.toHaveAttribute('data-phase', 'cameraLost', { timeout: 30_000 })
  const secondTrackId = await page.evaluate(
    () => (document.querySelector('video')?.srcObject as MediaStream).getVideoTracks()[0]?.id,
  )
  expect(secondTrackId).not.toBe(firstTrackId)
})

test('hiding the tab pauses the flight and comes back to the pause menu', async ({ page }) => {
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('canvas')).toBeVisible()

  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)

  await setHidden(true)
  await setHidden(false)
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
})

test('a model that fails to load offers Try again and the keyboard', async ({ page }) => {
  test.setTimeout(90_000)
  await page.route('**/pose_landmarker_lite.task', (route) => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: 'Start' }).click()

  const error = page.getByTestId('pose-model-error')
  await expect(error).toBeVisible({ timeout: 30_000 })
  await expect(error).toContainText("Motion tracking didn't load")
  await expect(error.getByRole('link', { name: 'Fly with the keyboard instead' })).toHaveAttribute(
    'href',
    '?input=keyboard',
  )
  await page.screenshot({ path: 'test-results/61-model-error.png' })

  await page.unroute('**/pose_landmarker_lite.task')
  await error.getByRole('button', { name: 'Try again' }).click()
  // Loading shows its own status line; ready shows neither that nor the error.
  await expect(page.getByTestId('pose-model-status')).toBeHidden({ timeout: 60_000 })
  await expect(error).toBeHidden()
  await expect(page.getByTestId('calibration-guidance')).toBeVisible()
})

test('a lost WebGL context remounts the canvas and keeps flying', async ({ page }) => {
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('[data-context-generation="0"] canvas')).toBeVisible()

  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const gl = canvas?.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  })

  await expect(page.locator('[data-context-generation="1"] canvas')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden()
  await expect(page.getByTestId('hud')).toBeVisible()
})
