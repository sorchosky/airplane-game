import { expect, test, type Page } from '@playwright/test'

// Into flight from either path (#161): the sim takes over the title flyby where it is, the blur
// ramps out and the chase camera glides in. Keyboard (the Mouse choice on a computer), Touch and
// a recorded pose replay each reach `flying`.

const snapshot = (page: Page) => page.evaluate(() => window.__driftwing?.snapshot())
const blur = (page: Page) => page.evaluate(() => window.__startTimeline?.look().blur ?? 0)

/** The flyby loop's centre and semi-axes (`TITLE_FLYBY`), with room for a few seconds of flight. */
function nearTheLoop(flight: { x: number; z: number }): boolean {
  const dx = (flight.x - 1750) / (380 + 300)
  const dz = (flight.z - 2000) / (300 + 300)
  return dx * dx + dz * dz <= 1
}

test('keyboard: flight takes over the flyby plane where it is, and the blur clears', async ({
  page,
}) => {
  // WebGL screenshots are slow on a shared runner.
  test.setTimeout(60_000)
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect.poll(() => blur(page)).toBeGreaterThan(0.99)

  const before = (await snapshot(page))!
  const beforeAt = Date.now()
  // Hold the exit at its midpoint for the screenshot: the ring halfway out, the rest fading.
  await page.evaluate(() => {
    const hold = () => {
      if (!document.querySelector('[data-testid="flight-ring"]')) return
      observer.disconnect()
      // Only the exit's own: the Start timeline's finished animations hold the Choose beat.
      const held = document.getAnimations().filter((a) => a.playState === 'running')
      for (const animation of held) {
        animation.pause()
        animation.currentTime = 220
      }
      Object.assign(window, { __held: held })
    }
    const observer = new MutationObserver(hold)
    observer.observe(document.body, { subtree: true, childList: true })
  })
  await page.getByRole('button', { name: 'Mouse' }).click()
  await expect(page.getByTestId('flight-ring')).toHaveCount(1)
  await page.screenshot({ path: 'docs/screenshots/161-into-flight-ring.png' })
  await page.evaluate(() =>
    (window as unknown as { __held: Animation[] }).__held.forEach((a) => a.play()),
  )

  await expect.poll(async () => (await snapshot(page))?.game).toBe('flying')
  const after = (await snapshot(page))!
  const seconds = (Date.now() - beforeAt) / 1000
  // No jump back to the spawn: the plane is still on (or just off) the loop, and it has moved no
  // further than it could fly in the time.
  expect(nearTheLoop(after.flight)).toBe(true)
  const moved = Math.hypot(after.flight.x - before.flight.x, after.flight.z - before.flight.z)
  expect(moved).toBeLessThan(70 * (seconds + 0.5))

  await expect.poll(() => blur(page)).toBe(0)
  await expect(page.locator('[data-beat]')).toHaveAttribute('data-beat', 'flight')
  await expect(page.getByTestId('control-select')).toHaveCount(0)
})

test('touch: the chosen frame rings out and flight starts', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  // Once the Choose beat has settled: a choice mid-enter reverses the enter instead.
  await expect.poll(() => blur(page)).toBeGreaterThan(0.99)
  // The ring lives 400 ms, so watch for it rather than poll for it.
  const ringSeen = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          if (!document.querySelector('[data-testid="flight-ring"]')) return
          observer.disconnect()
          resolve(true)
        })
        observer.observe(document.body, { subtree: true, childList: true })
        setTimeout(() => resolve(false), 5000)
      }),
  )
  await page.getByRole('button', { name: /Touch/ }).click()
  expect(await ringSeen).toBe(true)
  await expect.poll(async () => (await snapshot(page))?.game).toBe('flying')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  // The ring is gone with the beat.
  await expect(page.getByTestId('flight-ring')).toHaveCount(0)
  await expect.poll(() => blur(page)).toBe(0)
  await context.close()
})

test('replay: the Motion path reaches flight', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/?input=replay&replay=first-run&wings=off')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect.poll(async () => (await snapshot(page))?.game, { timeout: 45_000 }).toBe('flying')
  const { flight } = (await snapshot(page))!
  expect(nearTheLoop(flight)).toBe(true)
})

test('reduced motion: flight starts with no glide and the blur clears', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/?debug')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Mouse' }).click()
  await expect.poll(async () => (await snapshot(page))?.game).toBe('flying')
  await expect.poll(() => blur(page), { timeout: 1000 }).toBe(0)
  await context.close()
})
