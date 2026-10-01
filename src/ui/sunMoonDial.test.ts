import { describe, expect, it } from 'vitest'
import { moonDirectionAt, sunDirectionAt, sunElevationAt } from '../world/starVisibility'
import { sunMoonDialPosition } from './sunMoonDial'

describe('sun and moon dial', () => {
  it.each([
    [360, 0, 0],
    [720, 0.5, 1],
    [1080, 1, 0],
  ])('projects the sky sun direction at minute %i', (minute, x, y) => {
    const dial = sunMoonDialPosition(minute).sun
    const sky = sunDirectionAt(minute)
    expect(dial.x).toBeCloseTo(x)
    expect(dial.y).toBeCloseTo(y)
    expect(Math.asin(sky[1])).toBeCloseTo(sunElevationAt(minute))
  })

  it.each([
    [1080, 0, 0],
    [0, 0.5, 1],
    [360, 1, 0],
  ])('projects the sky moon direction at minute %i', (minute, x, y) => {
    const dial = sunMoonDialPosition(minute).moon
    const sky = moonDirectionAt(minute)
    expect(dial.x).toBeCloseTo(x)
    expect(dial.y).toBeCloseTo(y)
    expect(sky[1]).toBeGreaterThanOrEqual(-Number.EPSILON)
  })

  it('crossfades at the horizon without moving either glyph past an endpoint', () => {
    for (const minute of [350, 360, 370, 1070, 1080, 1090]) {
      const { sun, moon } = sunMoonDialPosition(minute)
      for (const glyph of [sun, moon]) {
        expect(glyph.x).toBeGreaterThanOrEqual(0)
        expect(glyph.x).toBeLessThanOrEqual(1)
        expect(glyph.y).toBeGreaterThanOrEqual(0)
        expect(glyph.y).toBeLessThanOrEqual(1)
      }
    }
    expect(sunMoonDialPosition(360).sun.opacity).toBeCloseTo(0.5)
    expect(sunMoonDialPosition(360).moon.opacity).toBeCloseTo(0.5)
    expect(sunMoonDialPosition(1080).sun.opacity).toBeCloseTo(0.5)
    expect(sunMoonDialPosition(1080).moon.opacity).toBeCloseTo(0.5)
  })
})
