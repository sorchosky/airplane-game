import { expect, test } from '@playwright/test'

// Keyboard mode starts with `active: false` (Space toggles it), so its teaching prompt shows
// straight away and Esc drives pause/resume.
test('keyboard: prompt while inactive, Esc pauses, Esc resumes through the countdown', async ({
  page,
}) => {
  // Three full-page screenshots of the flight scene under software GL can take seconds each.
  test.setTimeout(60_000)
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()

  const prompt = page.getByTestId('hud-prompt')
  await expect(prompt).toHaveAttribute('data-prompt', 'press-space')
  await expect(prompt).toHaveText('Press Space to fly')
  await expect(prompt).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/18-prompt-spread-arms.png' })

  await page.keyboard.press(' ')
  await expect(prompt).toHaveAttribute('data-prompt', 'none')

  await page.keyboard.press('Escape')
  const paused = page.getByRole('dialog', { name: 'Paused' })
  await expect(paused).toBeVisible()
  await expect(paused).toContainText('Esc to resume')
  await page.screenshot({ path: 'test-results/18-paused.png' })

  await page.keyboard.press('Escape')
  // Any tick counts: at software-GL frame rates the first poll can land on 2 or 1.
  await expect(page.getByTestId('resume-countdown')).toHaveText(/^[123]$/)
  await page.screenshot({ path: 'test-results/18-countdown.png' })
  await expect(paused).toBeHidden({ timeout: 5000 })
})

test('mouse: teaches movement once at desktop size', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /Mouse/ }).click()

  const prompt = page.getByTestId('hud-prompt')
  await expect(prompt).toHaveAttribute('data-prompt', 'move-mouse')
  await expect(prompt).toHaveText('Move the mouse to steer')
  await page.screenshot({ path: 'docs/screenshots/226-mouse-prompt-1920.png' })

  await page.mouse.move(400, 400)
  await expect(prompt).toHaveAttribute('data-prompt', 'none')
  await page.mouse.move(1920, 400)
  await expect(prompt).toHaveAttribute('data-prompt', 'none')
})

test('touch: never shows the arms prompt and teaches drag once at phone size', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /Touch/ }).click()

  const prompt = page.getByTestId('hud-prompt')
  await expect(prompt).not.toHaveAttribute('data-prompt', 'spread-arms')
  await expect(prompt).toHaveAttribute('data-prompt', 'touch-to-steer')
  await expect(prompt).toHaveText('Touch and drag to steer')
  await page.screenshot({ path: 'docs/screenshots/226-touch-prompt-844.png' })

  const joystick = page.getByTestId('touch-joystick-zone')
  await joystick.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 180,
    clientY: 230,
  })
  await expect(prompt).toHaveAttribute('data-prompt', 'none')
  await joystick.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 180,
    clientY: 230,
  })
  await page.waitForTimeout(500)
  await expect(prompt).toHaveAttribute('data-prompt', 'none')
  await expect(prompt).not.toHaveAttribute('data-prompt', 'spread-arms')
  await context.close()
})
