import { expect, test } from '@playwright/test'

// Keyboard mode starts with `active: false` (Space toggles it), so the autopilot prompt shows
// straight away and Esc drives pause/resume.
test('keyboard: prompt while inactive, Esc pauses, Esc resumes through the countdown', async ({
  page,
}) => {
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
  await expect(page.getByTestId('resume-countdown')).toHaveText('3')
  await page.screenshot({ path: 'test-results/18-countdown.png' })
  await expect(paused).toBeHidden({ timeout: 5000 })
})
