import { describe, expect, it } from 'vitest'
import { lightingPresets } from '../styles/tokens'
import {
  coolGrass,
  linearRgb,
  luminance,
  rotateHue,
  strataPhase,
  sunTintWeights,
  TERRAIN_PALETTE,
  terrainColorAt,
  type Rgb,
  type TerrainSurface,
} from './terrainColor'
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

/** Hue angle in degrees, in the plane perpendicular to the grey axis. */
function hueDegrees([r, g, bl]: Rgb): number {
  return (Math.atan2(Math.sqrt(3) * (g - bl), 2 * r - g - bl) * 180) / Math.PI
}

const sum = (c: Rgb) => c[0] + c[1] + c[2]

/** No detail: sunFacing between the two tint ramps, no noise, at the camera. */
const NEUTRAL: TerrainSurface = {
  macro: 0,
  macroValue: 0,
  brush: 0,
  distance: 0,
  sunFacing: 0.45,
  ambientSky: linearRgb(lightingPresets.morning.ambientSky),
}
const at = (overrides: Partial<TerrainSurface>): TerrainSurface => ({ ...NEUTRAL, ...overrides })

describe('rotateHue', () => {
  const green = TERRAIN_PALETTE.grassLight

  it('keeps brightness and is the identity at 0° and 360°', () => {
    expect(sum(rotateHue(green, 6))).toBeCloseTo(sum(green), 10)
    expectColor(rotateHue(green, 0), green)
    expectColor(rotateHue(green, 360), green)
  })

  it('turns the hue by the given angle', () => {
    expect(hueDegrees(rotateHue(green, 6)) - hueDegrees(green)).toBeCloseTo(6, 6)
    expect(hueDegrees(rotateHue(green, -6)) - hueDegrees(green)).toBeCloseTo(-6, 6)
  })
})

describe('strataPhase', () => {
  it('spaces the strata between strataSpacingMin and strataSpacingMax', () => {
    const dy = 0.01
    let widest = 0
    let closest = Infinity
    for (let y = 0; y < 600; y += 0.5) {
      const spacing = dy / (strataPhase(y + dy, 0) - strataPhase(y, 0))
      widest = Math.max(widest, spacing)
      closest = Math.min(closest, spacing)
    }
    expect(closest).toBeGreaterThanOrEqual(b.strataSpacingMin - 0.01)
    expect(widest).toBeLessThanOrEqual(b.strataSpacingMax + 0.01)
    expect(closest).toBeLessThan(b.strataSpacingMin + 0.1)
    expect(widest).toBeGreaterThan(b.strataSpacingMax - 0.1)
  })

  it('shifts with the macro noise, so bands wave across the landscape', () => {
    expect(strataPhase(200, 1) - strataPhase(200, 0)).toBeCloseTo(b.strataJitter, 10)
  })
})

describe('coolGrass', () => {
  it("leans grass-shadow to the sky's hue at grass-shadow's own brightness", () => {
    for (const preset of Object.values(lightingPresets)) {
      const cool = coolGrass(linearRgb(preset.ambientSky))
      const shadow = TERRAIN_PALETTE.grassShadow
      expect(luminance(cool)).toBeCloseTo(luminance(shadow), 6)
      expect(cool[2] / cool[1]).toBeGreaterThan(shadow[2] / shadow[1])
    }
  })
})

describe('sunTintWeights', () => {
  it('leans fully to grass-light within 30° of the sun and not at all past 60°', () => {
    expect(sunTintWeights(Math.cos(Math.PI / 6)).toward).toBeCloseTo(b.sunTintToward, 10)
    expect(sunTintWeights(1).toward).toBeCloseTo(b.sunTintToward, 10)
    expect(sunTintWeights(0.5).toward).toBe(0)
  })

  it('leans fully cool on faces turned from the sun, and never both ways at once', () => {
    expect(sunTintWeights(0).away).toBeCloseTo(b.sunTintAway, 10)
    expect(sunTintWeights(-0.5).away).toBeCloseTo(b.sunTintAway, 10)
    expect(sunTintWeights(0.35).away).toBe(0)
    for (let f = -1; f <= 1; f += 0.05) {
      const w = sunTintWeights(f)
      expect(w.toward === 0 || w.away === 0).toBe(true)
    }
  })
})

describe('terrainColorAt with surface detail (#69)', () => {
  it('is the plain band colour when the detail is neutral', () => {
    for (const noise of [-1, 0, 1]) {
      expectColor(
        terrainColorAt(GRASS_HEIGHT, FLAT, noise, config, NEUTRAL),
        terrainColorAt(GRASS_HEIGHT, FLAT, noise, config),
      )
    }
  })

  it('turns the grass hue ±macroHueDegrees and moves its value ±macroValue', () => {
    const plain = terrainColorAt(GRASS_HEIGHT, FLAT, 1, config)
    const warm = terrainColorAt(GRASS_HEIGHT, FLAT, 1, config, at({ macro: 1 }))
    expect(hueDegrees(warm) - hueDegrees(plain)).toBeCloseTo(b.macroHueDegrees, 6)
    const bright = terrainColorAt(GRASS_HEIGHT, FLAT, 1, config, at({ macroValue: 1 }))
    expect(sum(bright) / sum(plain)).toBeCloseTo(1 + b.macroValue, 6)
  })

  it('breaks up the value ±brushValue near the camera and fades it out by brushFadeEnd', () => {
    const plain = terrainColorAt(GRASS_HEIGHT, FLAT, 0, config)
    const near = terrainColorAt(GRASS_HEIGHT, FLAT, 0, config, at({ brush: -1 }))
    expect(sum(near) / sum(plain)).toBeCloseTo(1 - b.brushValue, 6)
    const far = terrainColorAt(
      GRASS_HEIGHT,
      FLAT,
      0,
      config,
      at({ brush: -1, distance: b.brushFadeEnd }),
    )
    expectColor(far, plain)
  })

  it('bands rock with strata, not grass, and fades them out by strataFadeEnd', () => {
    const cliff = 0.6
    const height = 150
    const plainRock = terrainColorAt(height, cliff, 0, config)
    const ratios: number[] = []
    for (let y = height; y < height + 8; y += 0.25) {
      const banded = terrainColorAt(y, cliff, 0, config, NEUTRAL)
      ratios.push(sum(banded) / sum(terrainColorAt(y, cliff, 0, config)))
    }
    expect(Math.max(...ratios)).toBeCloseTo(1 + b.strataValue, 2)
    expect(Math.min(...ratios)).toBeCloseTo(1 - b.strataValue, 2)
    expectColor(
      terrainColorAt(height, cliff, 0, config, at({ distance: b.strataFadeEnd })),
      plainRock,
    )
    // Gentle grass slopes carry no strata at any height.
    for (let y = GRASS_HEIGHT; y < GRASS_HEIGHT + 8; y += 0.5) {
      expectColor(terrainColorAt(y, FLAT, 0, config, NEUTRAL), terrainColorAt(y, FLAT, 0, config))
    }
  })

  it('leans sunlit grass to grass-light and shaded grass cooler and bluer', () => {
    const plain = terrainColorAt(GRASS_HEIGHT, FLAT, -1, config)
    const sunlit = terrainColorAt(GRASS_HEIGHT, FLAT, -1, config, at({ sunFacing: 1 }))
    const shaded = terrainColorAt(GRASS_HEIGHT, FLAT, -1, config, at({ sunFacing: -0.2 }))
    const distance = (a: Rgb, c: Rgb) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])
    expect(distance(sunlit, TERRAIN_PALETTE.grassLight)).toBeLessThan(
      distance(plain, TERRAIN_PALETTE.grassLight),
    )
    expect(shaded[2] / shaded[1]).toBeGreaterThan(plain[2] / plain[1])
    expect(sum(shaded)).toBeLessThan(sum(plain))
  })
})
