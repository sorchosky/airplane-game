import { expect, test } from '@playwright/test'

// Loads the real self-hosted MediaPipe WASM and model against Chromium's
// fake camera. The fake feed has no person in it, so this checks the model
// loads and the loop runs and reports "no person", not landmark accuracy
// (that's #19's recorded-clip test). It doesn't assert the 20 Hz target:
// headless Chromium without a GPU runs WebGL in software, where one
// inference takes ~500 ms, so the rate here is inference-bound.
test('pose model loads lazily after Start and runs detection', async ({ page }) => {
  const modelRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/mediapipe/')) modelRequests.push(req.url())
  })

  await page.goto('/?input=pose&debug')
  // Lazy load: nothing MediaPipe is fetched on page load.
  await page.waitForTimeout(500)
  expect(modelRequests).toEqual([])

  await page.getByRole('button', { name: 'Start' }).click()

  const readout = page.getByTestId('pose-debug')
  await expect(readout).toContainText(/pose ready \((GPU|CPU)\)/, { timeout: 30_000 })
  await expect
    .poll(
      async () => {
        const match = /([\d.]+) Hz/.exec((await readout.textContent()) ?? '')
        return match ? Number(match[1]) : 0
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0)
  await expect(readout).toContainText('person no')

  // Everything came from our own origin, not a CDN.
  const origin = new URL(page.url()).origin
  expect(modelRequests.length).toBeGreaterThan(0)
  expect(modelRequests.every((url) => url.startsWith(origin))).toBe(true)

  console.log(`pose debug readout:\n${await readout.textContent()}`)
  await page.screenshot({ path: 'test-results/pose-service-calibrate.png' })
})
