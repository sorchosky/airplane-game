import { expect, test } from '@playwright/test'

test('title masthead uses the centred vignette and tinted contrast effects', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?shot=title')

  const vignette = page.locator('[data-shared-element="scrim"]')
  const wordmark = page.locator('[data-shared-element="wordmark"]')
  const start = page.getByRole('button', { name: 'Start' })
  await expect(vignette).toHaveCSS('background-image', /radial-gradient/)
  await expect(vignette).toHaveCSS('backdrop-filter', 'none')
  await expect(wordmark).toHaveCSS(
    'text-shadow',
    /rgba\(27, 39, 72, 0\.45\).*rgba\(27, 39, 72, 0\.35\)/,
  )
  await expect(start).toHaveCSS('box-shadow', /rgba\(27, 39, 72, 0\.3\)/)

  const masthead = wordmark.locator('..')
  const box = await masthead.boundingBox()
  expect(box).not.toBeNull()
  expect((box?.y ?? 0) + (box?.height ?? 0) / 2).toBeCloseTo(1080 * 0.46, 0)
})

test('title screen shows Start then control selection and camera calibration', async ({ page }) => {
  await page.goto('/')
  const start = page.getByRole('button', { name: 'Start' })
  await expect(start).toBeVisible()

  await start.click()
  await expect(page.getByTestId('control-select')).toBeVisible()
  await page.getByRole('button', { name: /Motion/ }).click()
  await expect(page.getByTestId('calibration-guidance')).toBeVisible()
})

test('desktop select offers mouse and keyboard fallback, then shows the menu after quitting', async ({
  page,
}) => {
  // The flight scene and the pause scrim run at 300 to 550 ms a frame on a software-GL runner,
  // and each click waits several frames for the target to settle: ~25 s end to end (#216).
  test.setTimeout(60_000)
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('button', { name: /Mouse/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Touch/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/control-select-desktop.png' })
  await page.getByRole('button', { name: /Mouse/ }).click()
  // The world canvas is already up behind the title, so wait for the flight beat itself.
  await expect(page.locator('[data-beat]')).toHaveAttribute('data-beat', 'flight')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
  await page.getByRole('button', { name: 'Quit to title' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('control-select')).toBeVisible()
})

test('coarse primary pointer offers touch and an on-screen pause button', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('button', { name: /Touch/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Mouse/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/control-select-touch.png' })
  await page.getByRole('button', { name: /Touch/ }).click()
  const joystickZone = page.getByTestId('touch-joystick-zone')
  await joystickZone.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 180,
    clientY: 230,
  })
  await expect(page.getByTestId('touch-joystick')).toBeVisible()
  await joystickZone.dispatchEvent('pointermove', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 216,
    clientY: 194,
  })
  const input = () => page.evaluate(() => window.__driftwing?.snapshot().input)
  await expect.poll(async () => (await input())?.roll).toBeGreaterThan(0)
  await expect.poll(async () => (await input())?.pitch).toBeGreaterThan(0)
  expect((await input())?.active).toBe(true)
  await page.screenshot({ path: 'test-results/touch-joystick.png' })
  await joystickZone.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 180,
    clientY: 230,
  })
  await expect.poll(async () => (await input())?.active).toBe(false)
  await expect(page.getByTestId('touch-joystick')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
  await context.close()
})

test('?input=keyboard skips straight to the flight scene', async ({ page }) => {
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('[data-testid="world"] canvas[data-engine]')).toBeVisible()
})

test('Escape and browser back from the control choice return to the title', async ({ page }) => {
  await page.goto('/')
  const start = page.getByRole('button', { name: 'Start' })
  await start.click()
  await expect(page.getByTestId('control-select')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(start).toBeVisible()
  await expect(page.getByTestId('control-select')).toHaveCount(0)

  await start.click()
  await expect(page.getByTestId('control-select')).toBeVisible()
  await page.goBack()
  await expect(start).toBeVisible()
})
