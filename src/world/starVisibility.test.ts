import { describe, expect, it } from 'vitest'
import { starVisibility, sunElevationAt } from './starVisibility'

const rad = (degrees: number) => (degrees * Math.PI) / 180

describe('starVisibility', () => {
  it('hides every star while the sun is above the horizon', () => {
    for (const magnitude of [0, 0.25, 0.5, 0.75, 1]) {
      expect(starVisibility(rad(0.01), magnitude)).toBe(0)
      expect(starVisibility(0, magnitude)).toBe(0)
    }
  })

  it('brings the brightest stars in first', () => {
    expect(starVisibility(rad(-2), 0)).toBe(0)
    expect(starVisibility(rad(-6), 0)).toBeCloseTo(0.5)
    expect(starVisibility(rad(-10), 0)).toBe(1)
    expect(starVisibility(rad(-5), 1)).toBe(0)
  })

  it('finishes the faintest stars at fourteen degrees below the horizon', () => {
    expect(starVisibility(rad(-6), 1)).toBe(0)
    expect(starVisibility(rad(-10), 1)).toBeCloseTo(0.5)
    expect(starVisibility(rad(-14), 1)).toBe(1)
  })

  it('uses the same solar elevation on either side of midnight', () => {
    expect(sunElevationAt(360)).toBeCloseTo(0)
    expect(sunElevationAt(1080)).toBeCloseTo(0)
    expect(sunElevationAt(720)).toBeCloseTo(Math.PI / 2)
    expect(sunElevationAt(0)).toBeCloseTo(-Math.PI / 2)
  })
})
