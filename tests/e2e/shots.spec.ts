import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { SHOT_BOOKMARKS } from '../../src/debug/shots'

// Captures every `?shot=` bookmark at 1920×1080 for before/after comparisons in art PRs.
// Skipped unless SHOTS=1: a full pass takes minutes under software GL, where one 1080p frame is
// seconds, so the readiness wait is generous. Options:
//   SHOTS_FX=high|medium|low   quality tier (default high)
//   SHOTS_DIR=<dir>            output root (default shots/, gitignored; never test-results,
//                              which Playwright wipes at the start of every run)
//   SHOTS_TAG=<name>           subfolder, e.g. the PR or palette being compared (default current)
//   SHOTS_ONLY=<a,b,...>       capture only these bookmarks (comma-separated)
// Each capture also writes <name>.json with the renderer's draw call and triangle counts.
const enabled = Boolean(process.env.SHOTS)
const tier = process.env.SHOTS_FX ?? 'high'
const outRoot = process.env.SHOTS_DIR ?? 'shots'
const tag = process.env.SHOTS_TAG ?? 'current'
const only = process.env.SHOTS_ONLY?.split(',').map((name) => name.trim())

test.describe('camera bookmarks', () => {
  test.skip(!enabled, 'Set SHOTS=1 to capture the ?shot= bookmarks')
  test.use({ viewport: { width: 1920, height: 1080 } })

  for (const shot of SHOT_BOOKMARKS) {
    if (only && !only.includes(shot.name)) continue
    test(`${shot.name} at fx=${tier}`, async ({ page }) => {
      test.setTimeout(720_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(String(error)))

      await page.goto(`/?input=keyboard&fx=${tier}&shot=${shot.name}`)
      await page.getByRole('button', { name: 'Start' }).click()

      const ready = page.getByTestId('shot-ready')
      await expect(ready).toHaveAttribute('data-ready', 'true', { timeout: 600_000 })
      // A few more frames so the swapped-in tiles and the perf counters settle.
      await page.waitForTimeout(2000)

      const dir = `${outRoot}/${tag}/${tier}`
      mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: `${dir}/${shot.name}.png` })
      const stats = {
        shot: shot.name,
        tier,
        draws: Number(await ready.getAttribute('data-draws')),
        triangles: Number(await ready.getAttribute('data-tris')),
        terrainTiles: Number(await ready.getAttribute('data-tiles')),
      }
      writeFileSync(`${dir}/${shot.name}.json`, `${JSON.stringify(stats, null, 2)}\n`)
      expect(errors).toEqual([])
    })
  }
})
