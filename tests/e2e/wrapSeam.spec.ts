import { expect, test, type Page } from '@playwright/test'
import { TERRAIN_CONFIG } from '../../src/world/terrainConfig'

// The wrapping world (#177): a keyboard flight placed just short of the +x edge flies straight
// east across the seam. The plane comes out at the -x edge, and the frame it wraps on costs no
// more than any other: the terrain and foliage move with it instead of rebuilding.

const P = TERRAIN_CONFIG.worldPeriod
const EAST = -Math.PI / 2
const snapshot = (page: Page) => page.evaluate(() => window.__driftwing?.snapshot())

interface FrameSample {
  t: number
  x: number
}
type SampledWindow = Window & { __frames?: FrameSample[] }

// Small and without post: software GL in CI renders a full-size frame in hundreds of ms.
test.use({ viewport: { width: 960, height: 540 } })

test('flying straight across the seam wraps the plane with no frame-time spike', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?input=keyboard&debug&fx=low&wings=off')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect.poll(async () => (await snapshot(page))?.game, { timeout: 30_000 }).toBe('flying')

  // 150 m up keeps under the cumulus layer (320 m and up). 2 km short of the edge: at cruise that's about 45 s, time for the new place to stream in
  // (software GL in CI takes 15 s or more for a whole layout).
  const startX = P / 2 - 2000
  await page.evaluate(([x, heading]) => window.__driftwing?.place(x, 300, heading, 150), [
    startX,
    EAST,
  ] as const)
  const hud = page.getByTestId('perf-hud')
  const tiles = async () => Number((await hud.textContent())?.match(/(\d+) tiles/)?.[1] ?? 0)
  // Let the placed layout finish streaming before measuring.
  await expect.poll(tiles, { timeout: 60_000 }).toBeGreaterThan(0)
  expect((await snapshot(page))?.flight.x ?? P, 'still short of the seam').toBeLessThan(P / 2 - 200)

  await page.evaluate(() => {
    const frames: FrameSample[] = []
    ;(window as SampledWindow).__frames = frames
    const tick = (t: number) => {
      const s = window.__driftwing?.snapshot()
      if (s) frames.push({ t, x: s.flight.x })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  // For the PR: the view just short of the edge and just past it, which should match.
  await expect
    .poll(async () => (await snapshot(page))?.flight.x ?? 0, { timeout: 60_000 })
    .toBeGreaterThan(P / 2 - 60)
  await page.screenshot({ path: 'test-results/177-seam-before.png' })
  await expect
    .poll(async () => (await snapshot(page))?.flight.x ?? 0, { timeout: 60_000 })
    .toBeLessThan(0)
  await page.screenshot({ path: 'test-results/177-seam-after.png' })
  // The tiles moved with the plane: the layout on screen never emptied.
  expect(await tiles()).toBeGreaterThan(0)
  // A few seconds on the far side.
  await page.waitForTimeout(3000)

  const frames = await page.evaluate(() => (window as SampledWindow).__frames ?? [])
  const wrapAt = frames.findIndex((f, i) => i > 0 && f.x < (frames[i - 1]?.x ?? 0) - P / 2)
  expect(wrapAt, 'the plane wrapped').toBeGreaterThan(0)
  // Came out on the far edge, a frame's flight in.
  expect(frames[wrapAt]?.x ?? 0).toBeLessThan(-P / 2 + 50)

  const deltas = frames.slice(1).map((f, i) => f.t - (frames[i]?.t ?? f.t))
  const sorted = [...deltas].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  // The wrap frame and the next few, while anything that reacts to it would show.
  const around = deltas.slice(wrapAt - 1, wrapAt + 4)
  expect(median).toBeGreaterThan(0)
  expect(Math.max(...around), `median ${median.toFixed(1)} ms`).toBeLessThanOrEqual(2 * median)
  expect(errors).toEqual([])
})
