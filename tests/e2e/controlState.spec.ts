import { expect, test } from '@playwright/test'

// Keyboard mode starts with `active: false` (Space toggles it), so the autopilot prompt shows
// straight away and Esc drives pause/resume.
test('keyboard: prompt while inactive, Esc pauses, Esc resumes through the countdown', async ({
  page,
}) => {
  // Three full-page screenshots of the flight scene under software GL can take seconds each.
  test.setTimeout(60_000)
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()

  const prompt = page.getByTestId('hud-prompt')
  await expect(prompt).toHaveAttribute('data-prompt', 'spread-arms')
  await expect(prompt).toHaveText('Spread your arms to fly')
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
