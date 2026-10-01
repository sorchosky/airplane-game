import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/** Shared map artifact helper for route-authoring tickets. */
export async function saveWorldMapScreenshot(page: Page, issue: number): Promise<void> {
  mkdirSync('docs/screenshots', { recursive: true })
  await page.getByTestId('world-map').screenshot({ path: `docs/screenshots/${issue}-map.png` })
}

test('renders and captures the world map without WebGL', async ({ page }) => {
  await page.goto('/?map=16')
  await expect(page.getByText('Map ready')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.locator('canvas')).not.toHaveAttribute('data-engine')
  await saveWorldMapScreenshot(page, 168)
})
