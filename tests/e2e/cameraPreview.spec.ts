import { expect, test } from '@playwright/test'

// `?input=pose` avoids the touch drag-zone overlay that `?input=keyboard`
// (the default) renders over the whole viewport, which today intercepts
// clicks on the Start button — a pre-existing issue outside this ticket's
// scope (see PR handoff notes).
test('camera preview appears large, left and mirrored on the calibrate screen', async ({
  page,
}) => {
  await page.goto('/?input=pose')
  await page.getByRole('button', { name: 'Start' }).click()

  // The fake camera feed has no person in it.
  await expect(page.getByTestId('calibration-guidance')).toHaveText(
    'Step back until your head and hips are in view',
  )

  const video = page.locator('video')
  await expect(video).toBeVisible()
  await expect(video).toHaveCSS('transform', /matrix\(-1, 0, 0, 1/)
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(300)

  const box = await video.boundingBox()
  expect(box).not.toBeNull()
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (box && viewport) {
    expect(box.x).toBeLessThan(viewport.width / 2)
    expect(box.y).toBeLessThan(viewport.height / 2)
    // Larger than the in-flight 20vw corner preview during calibration.
    expect(box.width).toBeGreaterThan(viewport.width * 0.3)
  }

  await page.screenshot({ path: 'test-results/camera-preview-calibrate.png' })
})
