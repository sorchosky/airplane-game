import { expect, test } from '@playwright/test'

test('title screen shows the three-step how to play', async ({ page }) => {
  await page.goto('/')
  const howTo = page.getByRole('region', { name: 'How to play' })
  await expect(howTo.getByRole('listitem')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/28-title-how-to-play.png' })
})

test('keyboard: pause menu navigates with arrows and Enter quits to title', async ({ page }) => {
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.keyboard.press('Escape')

  const menu = page.getByTestId('pause-menu')
  await expect(menu).toHaveAttribute('data-highlight', 'resume')
  await page.screenshot({ path: 'test-results/28-pause-menu.png' })

  await page.keyboard.press('ArrowRight')
  await expect(menu).toHaveAttribute('data-highlight', 'quit')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
})

test('pause menu Resume (click) runs the countdown back to flight', async ({ page }) => {
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByTestId('resume-countdown')).toHaveText('3')
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden({ timeout: 5000 })
})

test('portrait shows the turn-sideways prompt and pauses the flight', async ({ page }) => {
  await page.goto('/?input=keyboard')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('canvas')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('orientation-prompt')).toContainText('Turn your phone sideways')
  await page.screenshot({ path: 'test-results/28-orientation-prompt.png' })

  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(page.getByTestId('orientation-prompt')).toBeHidden()
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
})
