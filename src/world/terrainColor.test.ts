import { describe, expect, it } from 'vitest'
import { linearRgb, TERRAIN_PALETTE, terrainColorAt, type Rgb } from './terrainColor'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG
const b = config.bands
const FLAT = 0
const GRASS_HEIGHT = config.waterLevel + 60

function expectColor(actual: Rgb, expected: Rgb) {
  actual.forEach((channel, i) => expect(channel).toBeCloseTo(expected[i] ?? Number.NaN, 5))
}

function mix(a: Rgb, c: Rgb, t: number): Rgb {
  return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t]
}

describe('linearRgb', () => {
  it('matches the sRGB transfer curve Three.js uses', () => {
    expectColor(linearRgb('#000000'), [0, 0, 0])
    expectColor(linearRgb('#ffffff'), [1, 1, 1])
    expect(linearRgb('#808080')[0]).toBeCloseTo(0.2158605, 5)
  })
})

describe('terrainColorAt', () => {
  it('is light grass on gentle slopes where the noise is high', () => {
    expectColor(terrainColorAt(GRASS_HEIGHT, FLAT, 1, config), TERRAIN_PALETTE.grassLight)
  })

  it('shades grass toward grass-shadow where the noise is low', () => {
    expectColor(
      terrainColorAt(GRASS_HEIGHT, FLAT, -1, config),
      mix(TERRAIN_PALETTE.grassLight, TERRAIN_PALETTE.grassShadow, b.grassVariation),
    )
  })

  it('is sand just above the waterline and grass past the sand band', () => {
    const sandLine = config.waterLevel + b.sandHeight
    expectColor(terrainColorAt(sandLine - b.sandBlend, FLAT, 0, config), TERRAIN_PALETTE.sand)
    const grass = terrainColorAt(GRASS_HEIGHT, FLAT, 0, config)
    expectColor(terrainColorAt(sandLine + b.sandBlend, FLAT, 0, config), grass)
    // Halfway through the blend, halfway between the two.
    expectColor(terrainColorAt(sandLine, FLAT, 0, config), mix(grass, TERRAIN_PALETTE.sand, 0.5))
  })

  it('is rock on steep slopes and grass below the rock threshold', () => {
    const grass = terrainColorAt(GRASS_HEIGHT, FLAT, 0, config)
    expectColor(
      terrainColorAt(GRASS_HEIGHT, b.rockSlope + b.rockBlend, 0, config),
      TERRAIN_PALETTE.rock,
    )
    expectColor(terrainColorAt(GRASS_HEIGHT, b.rockSlope - b.rockBlend, 0, config), grass)
  })

  it('is snow above the snow line and not below it', () => {
    expectColor(terrainColorAt(b.snowHeight + b.snowBlend, FLAT, 0, config), TERRAIN_PALETTE.snow)
    const below = terrainColorAt(b.snowHeight - b.snowBlend, FLAT, 0, config)
    expectColor(below, terrainColorAt(GRASS_HEIGHT, FLAT, 0, config))
  })

  it('lets rock show through snow on slopes too steep to hold it', () => {
    const cliff = b.snowMaxSlope + b.rockBlend
    expectColor(terrainColorAt(b.snowHeight + 50, cliff, 0, config), TERRAIN_PALETTE.rock)
  })

  it('moves band thresholds with the noise, so edges wander', () => {
    // At the plain snow line, positive noise lifts the line (less snow), negative lowers it.
    const lifted = terrainColorAt(b.snowHeight, FLAT, 1, config)
    const lowered = terrainColorAt(b.snowHeight, FLAT, -1, config)
    expectColor(lowered, TERRAIN_PALETTE.snow)
    expect(lifted[2]).toBeLessThan(TERRAIN_PALETTE.snow[2] - 0.1)
    // Same for the rock threshold: positive noise makes a slope read steeper.
    const slope = b.rockSlope + b.rockBlend - b.slopeJitter
    expectColor(terrainColorAt(GRASS_HEIGHT, slope, 1, config), TERRAIN_PALETTE.rock)
    expect(terrainColorAt(GRASS_HEIGHT, slope, -1, config)).not.toEqual(TERRAIN_PALETTE.rock)
  })

  it('tints the lake bed from shallow to deep water color with depth', () => {
    const tint = b.underwaterTint
    const shallowBed = terrainColorAt(config.waterLevel - 1, FLAT, 0, config)
    const deepBed = terrainColorAt(config.waterLevel - b.deepWaterDepth, FLAT, 0, config)
    const deepExpected = mix(TERRAIN_PALETTE.sand, TERRAIN_PALETTE.waterDeep, tint)
    expectColor(deepBed, deepExpected)
    // Shallow bed is lighter than deep bed.
    expect(shallowBed[1]).toBeGreaterThan(deepBed[1])
    // Above the water, no tint at all.
    expectColor(
      terrainColorAt(config.waterLevel + 0.01, FLAT, 0, config),
      terrainColorAt(config.waterLevel + 0.01, FLAT, 0, {
        ...config,
        bands: { ...b, underwaterTint: 0 },
      }),
    )
  })

  it('defaults to TERRAIN_CONFIG', () => {
    expectColor(
      terrainColorAt(GRASS_HEIGHT, FLAT, 0.3),
      terrainColorAt(GRASS_HEIGHT, FLAT, 0.3, config),
    )
  })
})
