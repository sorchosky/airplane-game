import { describe, expect, it } from 'vitest'
import { lightingPresets } from '../styles/tokens'
import { POST_FX } from '../render/postFx'
import {
  CLOUD_CONFIG,
  CLOUD_LIT_GAIN,
  SUN_DIRECTION,
  cloudLayout,
  cloudShading,
  hexToLinear,
  farHazeAmount,
  hazeForViewDistance,
  nearHazeAmount,
  nearestTerrainEdge,
  wrapAround,
} from './atmosphere'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG

describe('SUN_DIRECTION', () => {
  it('is a unit vector above the horizon', () => {
    const [x, y, z] = SUN_DIRECTION
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10)
    expect(y).toBeGreaterThan(0)
  })
})

describe('haze', () => {
  it('fully hides terrain before its nearest possible edge', () => {
    expect(config.hazeFadeEnd).toBeLessThan(nearestTerrainEdge(config))
    expect(farHazeAmount(config.hazeFadeEnd, config)).toBe(1)
    expect(farHazeAmount(nearestTerrainEdge(config), config)).toBe(1)
  })

  it('leaves nearby terrain untouched by the far layer', () => {
    expect(farHazeAmount(0, config)).toBe(0)
    expect(farHazeAmount(config.hazeFadeStart, config)).toBe(0)
  })

  it('never decreases with distance', () => {
    let previousNear = 0
    let previousFar = 0
    for (let d = 0; d <= 12000; d += 250) {
      const near = nearHazeAmount(d, config)
      const far = farHazeAmount(d, config)
      expect(near).toBeGreaterThanOrEqual(previousNear)
      expect(far).toBeGreaterThanOrEqual(previousFar)
      previousNear = near
      previousFar = far
    }
  })

  it('caps the near warm layer at hazeWarmMax', () => {
    expect(nearHazeAmount(0, config)).toBe(0)
    expect(nearHazeAmount(1e7, config)).toBeCloseTo(config.hazeWarmMax, 6)
  })
})

describe('clouds', () => {
  const puffs = cloudLayout(CLOUD_CONFIG)

  it('is deterministic', () => {
    expect(cloudLayout(CLOUD_CONFIG)).toEqual(puffs)
  })

  it('builds the configured number of clusters in the 300–500 m band', () => {
    const clusters = new Set(puffs.map((p) => `${p.clusterX},${p.clusterZ}`))
    expect(clusters.size).toBe(CLOUD_CONFIG.clusters)
    expect(clusters.size).toBeGreaterThanOrEqual(30)
    expect(clusters.size).toBeLessThanOrEqual(60)
    for (const puff of puffs) {
      expect(puff.y).toBeGreaterThanOrEqual(300)
      expect(puff.y).toBeLessThanOrEqual(500)
      expect(puff.radius).toBeGreaterThanOrEqual(CLOUD_CONFIG.puffRadiusMin)
      expect(puff.radius).toBeLessThanOrEqual(CLOUD_CONFIG.puffRadiusMax)
    }
  })

  it('respawns past the full haze fade, so the jump is never seen', () => {
    expect(CLOUD_CONFIG.fieldSize / 2).toBeGreaterThan(config.hazeFadeEnd)
  })
})

describe('wrapAround', () => {
  it('keeps values inside center ± size / 2', () => {
    for (const value of [-50000, -9500, -1, 0, 1, 9499, 9500, 123456]) {
      const wrapped = wrapAround(value, 300, 19000)
      expect(wrapped).toBeGreaterThanOrEqual(300 - 9500)
      expect(wrapped).toBeLessThan(300 + 9500)
    }
  })

  it('leaves values already inside the window alone', () => {
    expect(wrapAround(1234, 1000, 19000)).toBeCloseTo(1234, 9)
  })

  it('moves a value that crosses one edge to the opposite edge', () => {
    expect(wrapAround(9501, 0, 19000)).toBeCloseTo(-9499, 9)
  })
})

describe('hazeForViewDistance', () => {
  it('is the configured fade at the full view distance', () => {
    expect(hazeForViewDistance(config.viewDistance, config)).toEqual({
      start: config.hazeFadeStart,
      end: config.hazeFadeEnd,
    })
  })

  it.each([10_000, 7000])('hides the terrain edge at a %i m view distance', (viewDistance) => {
    const { end } = hazeForViewDistance(viewDistance, config)
    expect(end).toBeLessThan(nearestTerrainEdge(config, viewDistance))
    expect(farHazeAmount(nearestTerrainEdge(config, viewDistance), config, viewDistance)).toBe(1)
  })
})

/** three's ACES filmic fit for a grey input: what a linear value becomes on screen. */
function acesGrey(x: number): number {
  const v = x / 0.6
  return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
}

describe('cloudShading', () => {
  for (const [name, preset] of Object.entries(lightingPresets)) {
    describe(name, () => {
      const { albedo, emissive } = cloudShading(preset)
      const sun = hexToLinear(preset.sun)
      const sky = hexToLinear(preset.ambientSky)
      const ground = hexToLinear(preset.ambientGround)
      const skyFill = (i: number) =>
        (0.5 * ((sky[i] ?? 0) + (ground[i] ?? 0)) * preset.hemisphereIntensity) / Math.PI
      const shaded = [0, 1, 2].map((i) => (albedo[i] ?? 0) * skyFill(i) + (emissive[i] ?? 0))
      const lit = [0, 1, 2].map(
        (i) => shaded[i]! + ((albedo[i] ?? 0) * (sun[i] ?? 0) * preset.sunIntensity) / Math.PI,
      )

      it('keeps albedo in 0..1 and emissive non-negative', () => {
        for (const a of albedo) expect(a).toBeGreaterThanOrEqual(0)
        for (const a of albedo) expect(a).toBeLessThanOrEqual(1)
        for (const e of emissive) expect(e).toBeGreaterThanOrEqual(0)
      })

      it("puts a puff's shaded side on the cloudShadow token", () => {
        const target = hexToLinear(preset.cloudShadow)
        shaded.forEach((c, i) => expect(c).toBeCloseTo(target[i] ?? 0, 5))
      })

      it('lights the sunny side brighter than the shaded side, near cloudLight', () => {
        const target = hexToLinear(preset.cloudLight)
        lit.forEach((c, i) => {
          expect(c).toBeGreaterThan(shaded[i] ?? 0)
          expect(c).toBeLessThanOrEqual((target[i] ?? 0) * CLOUD_LIT_GAIN + 1e-9)
        })
      })

      it('never blooms: the brightest face stays under the threshold after tone mapping', () => {
        const peak = Math.max(...lit)
        expect(acesGrey(peak)).toBeLessThan(POST_FX.bloom.threshold - POST_FX.bloom.smoothing)
      })
    })
  }
})
