import { describe, expect, it } from 'vitest'
import { hillshade, worldToMapPixel } from './worldMapMath'

describe('world map math', () => {
  it('maps the world centre and square edges to pixels', () => {
    const bounds = { centerX: 100, centerZ: -200, sizeMeters: 1000, pixels: 500 }
    expect(worldToMapPixel(100, -200, bounds)).toEqual([250, 250])
    expect(worldToMapPixel(-400, -700, bounds)).toEqual([0, 0])
    expect(worldToMapPixel(600, 300, bounds)).toEqual([500, 500])
  })

  it('lights a flat surface by the sun elevation', () => {
    expect(hillshade(10, 10, 10, 10, 8, [0, 1, 0])).toBeCloseTo(1)
    expect(hillshade(10, 10, 10, 10, 8, [1, 0, 0])).toBeCloseTo(0)
  })

  it('lights slopes facing the sun more strongly', () => {
    expect(hillshade(20, 0, 0, 0, 10, [1, 1, 0])).toBeGreaterThan(
      hillshade(0, 20, 0, 0, 10, [1, 1, 0]),
    )
  })
})
