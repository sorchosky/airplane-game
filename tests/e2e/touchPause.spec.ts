import { expect, test, type Browser } from '@playwright/test'

const VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
]

async function enterTouchFlight(
  browser: Browser,
  viewport: (typeof VIEWPORTS)[number],
  debug = false,
) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto(debug ? '/?debug' : '/')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /Touch/ }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  return { context, page }
}

for (const viewport of VIEWPORTS) {
  test(`touch Pause clears the sun and moon dial at ${viewport.width}x${viewport.height}`, async ({
    browser,
  }) => {
    // Each viewport boots the flight scene, which runs at 300 to 550 ms a frame on a
    // software-GL runner (#216, #217).
    test.setTimeout(60_000)
    const { context, page } = await enterTouchFlight(browser, viewport)
    const pauseBox = await page.getByTestId('touch-pause-action').boundingBox()
    const dialBox = await page.getByTestId('sun-moon-dial').boundingBox()
    expect(pauseBox).not.toBeNull()
    expect(dialBox).not.toBeNull()
    expect(pauseBox!.y).toBeGreaterThanOrEqual(dialBox!.y + dialBox!.height)

    if (viewport.width === 844) {
      await page.screenshot({ path: 'docs/screenshots/130-touch-pause.png' })
    }
    await context.close()
  })
}

test('touch Pause excludes the joystick, opens once, and clears debug controls', async ({
  browser,
}) => {
  const { context, page } = await enterTouchFlight(browser, VIEWPORTS[0], true)
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  const pauseBox = (await pause.boundingBox())!
  const debugBox = (await page.getByTestId('pose-record').boundingBox())!
  expect(debugBox.y + debugBox.height).toBeLessThanOrEqual(pauseBox.y)
  await page.screenshot({ path: 'docs/screenshots/130-touch-pause-debug.png' })

  await pause.dispatchEvent('pointerdown', {
    pointerId: 2,
    pointerType: 'touch',
    clientX: pauseBox.x + pauseBox.width / 2,
    clientY: pauseBox.y + pauseBox.height / 2,
  })
  expect(await page.evaluate(() => window.__driftwing?.snapshot().input.active)).toBe(false)
  await pause.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch' })

  const joystickZone = page.getByTestId('touch-joystick-zone')
  await joystickZone.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 180,
    clientY: 230,
  })
  await expect(page.getByTestId('touch-joystick')).toBeVisible()
  await pause.click()

  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(1)
  await expect(page.getByTestId('touch-joystick')).toHaveCount(0)
  await expect
    .poll(async () => page.evaluate(() => window.__driftwing?.snapshot().input.active))
    .toBe(false)

  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({
    timeout: 5000,
  })
  await expect
    .poll(async () => page.evaluate(() => window.__driftwing?.snapshot().game))
    .toBe('flying')
  await context.close()
})
