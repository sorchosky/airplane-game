import { describe, expect, it } from 'vitest'
import {
  carveLakes,
  carveRivers,
  findSpawnPoint,
  heightAt,
  normalAt,
  surfaceHeightAt,
} from './heightfield'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG

describe('heightAt', () => {
  it('is deterministic for a given seed', () => {
    const points = [
      [0, 0],
      [1234.5, -987.25],
      [-40000, 25000],
    ] as const
    for (const [x, z] of points) {
      expect(heightAt(x, z, config)).toBe(heightAt(x, z, config))
      expect(heightAt(x, z, { ...config })).toBe(heightAt(x, z, config))
    }
  })

  it('gives a different world for a different seed', () => {
    const other = { ...config, seed: 'another-world' }
    let differences = 0
    for (let i = 0; i < 20; i++) {
      if (Math.abs(heightAt(i * 700, i * 300, config) - heightAt(i * 700, i * 300, other)) > 1) {
        differences++
      }
    }
    expect(differences).toBeGreaterThan(15)
  })

  it('stays within a sane band and has hills, high ground and valleys', () => {
    const heights: number[] = []
    for (let x = -15000; x <= 15000; x += 250) {
      for (let z = -15000; z <= 15000; z += 250) heights.push(heightAt(x, z, config))
    }
    const min = Math.min(...heights)
    const max = Math.max(...heights)
    // Lake beds sit below the water, but never absurdly deep.
    expect(min).toBeGreaterThan(config.waterLevel - 40)
    // Stays under the flight model's 600 m ceiling so every ridge can be flown over.
    expect(max).toBeLessThan(600)
    expect(max).toBeGreaterThan(300)
    // Mostly rolling hills: the median sits in the hill band.
    const median = [...heights].sort((a, b) => a - b)[Math.floor(heights.length / 2)] ?? 0
    expect(median).toBeLessThan(config.hillHeight)
  })

  it('is continuous: nearby points have nearby heights', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 911
      const z = -i * 577
      expect(Math.abs(heightAt(x + 1, z, config) - heightAt(x, z, config))).toBeLessThan(5)
    }
  })
})

describe('lakes and rivers', () => {
  it('sinks some valleys near spawn below the water, but leaves most ground dry', () => {
    const spawn = findSpawnPoint(config)
    let under = 0
    let total = 0
    for (let x = -3000; x <= 3000; x += 100) {
      for (let z = -3000; z <= 3000; z += 100) {
        total++
        if (heightAt(spawn.x + x, spawn.z + z, config) < config.waterLevel) under++
      }
    }
    expect(under / total).toBeGreaterThan(0.03)
    expect(under / total).toBeLessThan(0.3)
  })

  it('carveLakes leaves high ground alone and scoops low ground below the water', () => {
    expect(carveLakes(80, 80, config)).toBe(80)
    const lowest = config.lakeBasinHeight - config.lakeBasinBand
    expect(carveLakes(lowest, lowest, config)).toBeCloseTo(lowest - config.lakeDepth, 6)
    expect(carveLakes(config.waterLevel, config.waterLevel, config)).toBeLessThan(config.waterLevel)
  })

  it('carveLakes never turns a slope around (no rim around lakes)', () => {
    let previous = -Infinity
    for (let h = 0; h <= config.lakeBasinHeight + 10; h += 0.25) {
      const carved = carveLakes(h, h, config)
      expect(carved).toBeGreaterThan(previous)
      previous = carved
    }
  })

  it('carveRivers digs a channel below the water in the lowlands only', () => {
    expect(carveRivers(60, 0, config)).toBeCloseTo(config.waterLevel - config.riverDepth, 6)
    expect(carveRivers(60, config.riverValleyWidth, config)).toBe(60)
    expect(carveRivers(config.riverMaxHeight + 1, 0, config)).toBe(config.riverMaxHeight + 1)
  })

  it('surfaceHeightAt is never below the water', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 173
      const z = -i * 251
      expect(surfaceHeightAt(x, z, config)).toBe(
        Math.max(heightAt(x, z, config), config.waterLevel),
      )
    }
  })
})

describe('normalAt', () => {
  it('returns a unit vector pointing up-ish', () => {
    const [x, y, z] = normalAt(321, 654, config)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6)
    expect(y).toBeGreaterThan(0)
  })

  it('is straight up on flat ground', () => {
    const flat = {
      ...config,
      hillHeight: 0,
      mountainHeight: 0,
      peakHeight: 0,
      plateauHeight: 0,
      massifs: { ...config.massifs, height: 0 },
    }
    const [x, y, z] = normalAt(100, 100, flat)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(1, 6)
    expect(z).toBeCloseTo(0, 6)
  })
})

describe('findSpawnPoint', () => {
  it('is deterministic and sits in low ground', () => {
    const spawn = findSpawnPoint(config)
    expect(findSpawnPoint(config)).toEqual(spawn)
    expect(spawn.groundHeight).toBeCloseTo(heightAt(spawn.x, spawn.z, config), 6)
    expect(spawn.groundHeight).toBeLessThan(config.hillHeight * 0.5)
  })
})

describe('wrapping world (#176)', () => {
  const P = config.worldPeriod
  const { centerX, centerZ } = config.basin

  it('repeats every world period on x and on z, everywhere', () => {
    // Spread over several periods, including the basin, the route and the wrap seam.
    for (let i = 0; i < 300; i++) {
      const x = centerX + Math.sin(i * 12.9898) * 1.5 * P
      const z = centerZ + Math.cos(i * 78.233) * 1.5 * P
      const h = heightAt(x, z, config)
      expect(Math.abs(heightAt(x + P, z, config) - h)).toBeLessThan(1e-6)
      expect(Math.abs(heightAt(x, z + P, config) - h)).toBeLessThan(1e-6)
      expect(Math.abs(heightAt(x - 2 * P, z - P, config) - h)).toBeLessThan(1e-6)
    }
  })

  it('has no seam: the slope across the wrap edge matches the slope beside it', () => {
    // The copy round the basin flips to the next one half a period out from its centre.
    const seams: [number, number, 'x' | 'z'][] = []
    for (let k = 0; k < 60; k++) {
      seams.push([centerX + P / 2, centerZ - P / 2 + (k + 0.5) * (P / 60), 'x'])
      seams.push([centerX - P / 2 + (k + 0.5) * (P / 60), centerZ - P / 2, 'z'])
    }
    for (const [x, z, axis] of seams) {
      const at = (d: number) =>
        axis === 'x' ? heightAt(x + d, z, config) : heightAt(x, z + d, config)
      const across = (at(0.05) - at(-0.05)) / 0.1
      const before = (at(-0.05) - at(-0.15)) / 0.1
      const after = (at(0.15) - at(0.05)) / 0.1
      expect(Math.abs(across)).toBeLessThan(5)
      expect(Math.abs(across - (before + after) / 2)).toBeLessThan(0.05)
    }
  })

  it('normals repeat too, so lighting has no seam', () => {
    for (let i = 0; i < 40; i++) {
      const x = i * 613 - 9000
      const z = i * -419 + 7000
      const a = normalAt(x, z, config)
      const b = normalAt(x + P, z - P, config)
      for (let k = 0; k < 3; k++) expect(b[k]).toBeCloseTo(a[k]!, 5)
    }
  })

  it('keeps the world in one period that holds no repeat within view', () => {
    expect(P).toBeGreaterThan(2 * config.viewDistance)
    for (const ring of config.lodRings) expect(P % ring.spacing).toBe(0)
  })
})
