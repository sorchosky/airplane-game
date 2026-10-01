import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// Feeds a real phone clip (walk in, T-pose, tilts, arms up, arms down) to Chromium as the camera,
// so camera -> MediaPipe -> gesture -> flight all run on real pixels. The clip is committed as a
// small mp4 and converted to the .y4m Chromium needs here, because the .y4m is over 100 MB. It goes in the OS temp dir, since Playwright clears
// `test-results/` after the spec files load.
const CLIP = resolve('tests/fixtures/video/flight.mp4')
const Y4M = join(tmpdir(), 'driftwing-fake-camera', 'flight.y4m')

function convert(): string | null {
  if (!existsSync(CLIP)) return `clip ${CLIP} is missing, see tests/fixtures/video/README.md`
  if (existsSync(Y4M)) return null
  mkdirSync(dirname(Y4M), { recursive: true })
  try {
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        CLIP,
        '-vf',
        'scale=640:480,fps=15',
        '-pix_fmt',
        'yuv420p',
        `${Y4M}.${process.pid}.y4m`,
      ],
      { stdio: 'pipe' },
    )
    // Each worker loads this file, so convert to a private name and rename into place atomically.
    renameSync(`${Y4M}.${process.pid}.y4m`, Y4M)
  } catch {
    return 'ffmpeg is not installed, so the clip cannot be converted to .y4m'
  }
  return null
}

const skipReason = convert()

test.use({
  viewport: { width: 960, height: 540 },
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${Y4M}`,
    ],
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
  },
})

test('a real clip is detected through the camera pipeline and goes active', async ({ page }) => {
  test.skip(skipReason !== null, skipReason ?? '')
  test.setTimeout(120_000)
  await page.goto('/?input=pose&debug&fx=low')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('pose-debug')).toContainText('person yes', { timeout: 60_000 })
  await expect
    .poll(async () => page.evaluate(() => window.__driftwing?.snapshot().input.active), {
      timeout: 60_000,
    })
    .toBe(true)
})

// Calibration needs the whole arm span inside the frame, so the clip is framed with margin.
test('a real clip calibrates and reaches flying', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/?input=pose&debug&fx=low')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect
    .poll(async () => page.evaluate(() => window.__driftwing?.snapshot().game), {
      timeout: 200_000,
    })
    .toBe('flying')
})
