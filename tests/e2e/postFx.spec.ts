import { expect, test } from '@playwright/test'

// Each quality tier boots into flight without errors. The screenshots are the ?fx=off / ?fx=high
// side-by-side for owner review. Terrain streams in slowly under software GL, so these frames
// may show only sky and plane; the PR's review shots load terrain first at a small viewport.
for (const fx of ['off', 'medium', 'high'] as const) {
  test(`?fx=${fx} renders the flight scene`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto(`/?input=keyboard&fx=${fx}`)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.locator('canvas')).toBeVisible()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `test-results/26-fx-${fx}.png` })

    expect(errors).toEqual([])
  })
}
