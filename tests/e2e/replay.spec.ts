import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DriftwingSnapshot } from '../../src/debug/testHook'

type SampledWindow = Window & { __samples?: DriftwingSnapshot[] }

function snapshot(page: Page): Promise<DriftwingSnapshot | undefined> {
  return page.evaluate(() => window.__driftwing?.snapshot())
}

/** Flying samples from the first one labelled `from` up to (not including) the first labelled `to`. */
function between(samples: DriftwingSnapshot[], from: string, to: string): DriftwingSnapshot[] {
  const flying = samples.filter((s) => s.game === 'flying')
  const start = flying.findIndex((s) => s.replay.label === from)
  const end = flying.findIndex((s) => s.replay.label === to)
  return start < 0 ? [] : flying.slice(start, end < 0 ? undefined : end)
}

// Small and without post: software GL in CI renders a full-size frame in hundreds of ms.
test.use({ viewport: { width: 960, height: 540 } })

// The first-run fixture (scripts/build-replay-fixture.mjs) played through the real calibration,
// gesture interpreter, control machine and flight model: no camera, no MediaPipe. The page samples
// the sim every animation frame and the assertions read each fixture segment from those samples.
// The plane lags the body by the bank and pitch springs, so each check looks from the start of its
// segment to the start of the next opposite one rather than at a single instant.
test('replay: calibrates, engages the gate, banks with the tilt, climbs and dives with the arms', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto('/?input=replay&replay=first-run&fx=low')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('calibration-guidance')).toBeVisible()

  await page.evaluate(() => {
    const samples: DriftwingSnapshot[] = []
    ;(window as SampledWindow).__samples = samples
    const tick = () => {
      const s = window.__driftwing?.snapshot()
      if (s) samples.push(s)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await expect.poll(async () => (await snapshot(page))?.game, { timeout: 30_000 }).toBe('flying')
  // The screenshot for the PR: the plane in its right bank.
  await expect
    .poll(async () => (await snapshot(page))?.flight.bankDeg, { timeout: 60_000 })
    .toBeGreaterThan(15)
  await page.screenshot({ path: 'test-results/62-replay-flying.png' })
  await expect
    .poll(async () => (await snapshot(page))?.replay.label, { timeout: 60_000 })
    .toBe('arms-at-sides')

  const samples = await page.evaluate(() => (window as SampledWindow).__samples ?? [])
  // Kept beside the screenshot, so a failure can be read frame by frame.
  writeFileSync('test-results/62-replay-samples.json', JSON.stringify(samples))
  const flying = samples.filter((s) => s.game === 'flying')
  expect(flying.length).toBeGreaterThan(0)
  expect(flying.every((s) => s.input.source === 'replay')).toBe(true)
  expect(samples.some((s) => s.calibrated)).toBe(true)

  // The gate engages from the calibration T-pose and the control machine follows.
  expect(flying.some((s) => s.input.active && s.controlPhase === 'active')).toBe(true)

  const leftward = between(samples, 'tilt-left', 'tilt-right').map((s) => s.flight.bankDeg)
  const rightward = between(samples, 'tilt-right', 'climb').map((s) => s.flight.bankDeg)
  expect(leftward.length, 'tilt-left sampled').toBeGreaterThan(0)
  expect(rightward.length, 'tilt-right sampled').toBeGreaterThan(0)
  expect(Math.min(...leftward)).toBeLessThan(-5)
  expect(Math.max(...rightward)).toBeGreaterThan(5)

  const pitched = between(samples, 'climb', 'arms-at-sides').map((s) => s.flight.altitude)
  expect(pitched.length, 'climb and dive sampled').toBeGreaterThan(1)
  const peak = pitched.indexOf(Math.max(...pitched))
  expect(pitched[peak]).toBeGreaterThan((pitched[0] ?? Infinity) + 2)
  expect(Math.min(...pitched.slice(peak))).toBeLessThan((pitched[peak] ?? -Infinity) - 2)
})
