import { expect, test, type Page } from '@playwright/test'

// #63: title pose demo, camera ask and denied frames, each calibrate phase, and the lock-in.
// Calibrate phases use `?input=replay` with a one-pose fixture served in place of first-run, so each
// check can be held still for its screenshot. Screenshots land in test-results/ for the PR.

test.use({ viewport: { width: 1280, height: 720 } })

interface Point {
  x: number
  y: number
  z: number
  visibility: number
}

/**
 * A synthetic 33-point pose in mirrored normalized space: shoulders `width` apart centred at
 * y = 0.4, hips below. `arms` out (a T-pose) or down at the sides.
 */
function syntheticPose(width: number, arms: 'out' | 'down', hipsVisible = true): Point[] {
  const p = (x: number, y: number, visibility = 1): Point => ({ x, y, z: 0, visibility })
  const points = Array.from({ length: 33 }, () => p(0.5, 0.5, 0))
  const half = width / 2
  const sy = 0.4
  const hy = sy + width * 1.3 * (640 / 480)
  points[0] = p(0.5, sy - width * 0.6 * (640 / 480))
  points[11] = p(0.5 - half, sy)
  points[12] = p(0.5 + half, sy)
  if (arms === 'out') {
    points[13] = p(0.5 - half - width * 0.8, sy)
    points[14] = p(0.5 + half + width * 0.8, sy)
    points[15] = p(0.5 - half - width * 1.55, sy)
    points[16] = p(0.5 + half + width * 1.55, sy)
  } else {
    points[13] = p(0.5 - half - 0.01, sy + width)
    points[14] = p(0.5 + half + 0.01, sy + width)
    points[15] = p(0.5 - half - 0.01, sy + width * 1.9)
    points[16] = p(0.5 + half + 0.01, sy + width * 1.9)
  }
  points[23] = p(0.5 - width * 0.33, hy, hipsVisible ? 1 : 0)
  points[24] = p(0.5 + width * 0.33, hy, hipsVisible ? 1 : 0)
  return points
}

async function serveFixture(page: Page, landmarks: Point[] | null): Promise<void> {
  const frames = Array.from({ length: 200 }, (_, i) => ({ tMs: i * 50, landmarks }))
  await page.route('**/first-run*.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ frames }) }),
  )
}

test('title shows the tagline and the looping pose demonstration', async ({ page }) => {
  await page.goto('/?input=pose')
  await expect(page.getByText('Fly with your arms. Cast to a TV.')).toBeVisible()
  const demo = page.getByTestId('pose-demo')
  await expect(demo).toBeVisible()
  // The loop moves the arms.
  const arms = demo.locator('polyline').first()
  const first = await arms.getAttribute('points')
  await expect.poll(() => arms.getAttribute('points'), { timeout: 5_000 }).not.toBe(first)
  await page.waitForTimeout(3200)
  await page.screenshot({ path: 'test-results/63-title.png' })
})

test('the pose demonstration holds still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?input=pose')
  const arms = page.getByTestId('pose-demo').locator('polyline').first()
  const first = await arms.getAttribute('points')
  await page.waitForTimeout(1500)
  expect(await arms.getAttribute('points')).toBe(first)
})

test('camera ask frame shows while the browser prompt is open', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>(() => undefined)
  })
  await page.goto('/?input=pose')
  await page.getByRole('button', { name: 'Start' }).click()
  const ask = page.getByTestId('camera-ask')
  await expect(ask).toContainText('We need your camera to see you fly. Nothing leaves your phone.')
  await expect(ask).toHaveAttribute('data-denied', 'false')
  await page.screenshot({ path: 'test-results/63-camera-ask.png' })
})

test('a denied camera shows the settings hint and Try again', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('denied', 'NotAllowedError'))
  })
  await page.goto('/?input=pose')
  await page.getByRole('button', { name: 'Start' }).click()
  const ask = page.getByTestId('camera-ask')
  await expect(ask).toHaveAttribute('data-denied', 'true')
  await expect(ask).toContainText('Allow the camera in your browser settings')
  await page.screenshot({ path: 'test-results/63-camera-denied.png' })
  await ask.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
})

const PHASES = [
  { phase: 'noPerson', copy: 'Step into view', pose: () => null },
  { phase: 'tooClose', copy: 'Step back', pose: () => syntheticPose(0.26, 'out') },
  { phase: 'tooFar', copy: 'Come closer', pose: () => syntheticPose(0.05, 'out') },
  {
    phase: 'armsNotOut',
    copy: 'Spread your arms like wings',
    pose: () => syntheticPose(0.14, 'down'),
  },
] as const

for (const { phase, copy, pose } of PHASES) {
  test(`calibrate: ${phase} shows one line and its cue`, async ({ page }) => {
    await serveFixture(page, pose())
    await page.goto('/?input=replay&fx=low')
    await page.getByRole('button', { name: 'Start' }).click()
    const guidance = page.getByTestId('calibration-guidance')
    await expect(guidance).toHaveAttribute('data-phase', phase)
    await expect(guidance).toHaveText(copy)
    // Mid-pulse, so the cue is visible in the still.
    await page.waitForTimeout(600)
    await page.screenshot({ path: `test-results/63-calibrate-${phase}.png` })
  })
}

test('calibrate: holding a T-pose fills the ring, then locks in to flight', async ({ page }) => {
  test.setTimeout(60_000)
  await serveFixture(page, syntheticPose(0.14, 'out'))
  await page.goto('/?input=replay&fx=low&captions')
  await page.getByRole('button', { name: 'Start' }).click()
  const guidance = page.getByTestId('calibration-guidance')
  await expect(guidance).toHaveAttribute('data-phase', 'holding')
  await expect(guidance).toHaveText('Hold…')
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'test-results/63-calibrate-holding.png' })

  // Lock-in: the chime's caption shows in flight when captions are on.
  await expect(page.getByTestId('lock-in-caption')).toHaveText('Locked', { timeout: 15_000 })
  await page.screenshot({ path: 'test-results/63-lock-in.png' })
  await expect(page.getByTestId('lock-in-scrim')).toBeHidden()
})
