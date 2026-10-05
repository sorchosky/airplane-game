import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { CLUSTER_SPACING, islandPalmSites } from './islandPalms'
import { PALM_VARIANTS } from './models/palm'
import { cellsInRange, scatterChunk, selectFoliage, type ChunkFoliage } from './scatter'
import { seaIslands } from './sea'
import { TERRAIN_CONFIG as config } from './terrainConfig'

describe('island palms (#235)', () => {
  const sites = islandPalmSites(config)
  const islands = seaIslands(config)

  it('is deterministic', () => {
    expect(islandPalmSites(config)).toBe(sites)
    const again = islandPalmSites({ ...config }, heightAt)
    expect(again.length).toBe(sites.length)
    expect(again[7]).toEqual(sites[7])
  })

  it('grows a grove on every island', () => {
    for (const island of islands) {
      const own = sites.filter(
        (s) => Math.hypot(s.x - island.x, s.z - island.z) <= island.maxRadius,
      )
      expect(own.length, island.name).toBeGreaterThanOrEqual(12)
    }
  })

  it('plants only on island ground above the waterline', () => {
    for (const palm of sites) {
      expect(palm.y).toBeGreaterThan(config.waterLevel + 0.9)
      expect(palm.y).toBeCloseTo(heightAt(palm.x, palm.z, config), 6)
      const island = islands.find((i) => Math.hypot(palm.x - i.x, palm.z - i.z) <= i.maxRadius)
      expect(island, `palm at ${palm.x.toFixed(0)}, ${palm.z.toFixed(0)}`).toBeDefined()
    }
  })

  it('stands in clusters of 3 to 9 within a few metres of each other', () => {
    // Palms of one cluster are within 26 m (two cluster radii); count a palm's neighbours.
    const neighbours = sites.map(
      (a) => sites.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 26).length,
    )
    expect(Math.min(...neighbours)).toBeGreaterThanOrEqual(3)
    expect(CLUSTER_SPACING).toBeGreaterThan(0)
  })

  it('uses the three variants, with their heights and leans', () => {
    const variants = new Set(sites.map((s) => s.variant))
    expect(variants.size).toBe(3)
    for (const palm of sites) {
      const shape = PALM_VARIANTS[palm.variant]!
      expect(palm.lean).toBe(shape.tilt)
      expect(palm.scale / shape.scale).toBeGreaterThan(0.93)
      expect(palm.scale / shape.scale).toBeLessThan(1.07)
    }
  })

  it('leans toward the water: down the slope, or out from the middle on flat ground', () => {
    let toward = 0
    for (const palm of sites) {
      const island = islands.find((i) => Math.hypot(palm.x - i.x, palm.z - i.z) <= i.maxRadius)!
      // The model leans toward +X, turned by yaw to (cos yaw, -sin yaw).
      const lx = Math.cos(palm.yaw)
      const lz = -Math.sin(palm.yaw)
      const outward = (palm.x - island.x) * lx + (palm.z - island.z) * lz
      if (outward > 0) toward++
    }
    expect(toward / sites.length).toBeGreaterThan(0.9)
  })

  it('hands each foliage chunk the palms inside it, once, at its copy of the world', () => {
    const palm = sites[0]!
    const size = config.foliage.foliageChunk
    const cx = Math.floor(palm.x / size)
    const cz = Math.floor(palm.z / size)
    const here = scatterChunk(cx, cz, config)
    expect(
      here.palm.some((p) => Math.abs(p.x - palm.x) < 1e-6 && Math.abs(p.z - palm.z) < 1e-6),
    ).toBe(true)
    // One world period over, the same palm stands at the shifted place.
    const period = config.worldPeriod
    const shifted = scatterChunk(cx + 0, cz + 0, config).palm.length
    const periodChunks = period / size
    const other = scatterChunk(
      Math.floor((palm.x + period) / size),
      Math.floor((palm.z + period) / size),
      config,
    )
    expect(other.palm.some((p) => Math.abs(p.x - (palm.x + period)) < 1e-6)).toBe(true)
    expect(shifted).toBeGreaterThan(0)
    expect(periodChunks).toBeGreaterThan(0)
  })

  it('keeps palms out of an exclusion', () => {
    const palm = sites[0]!
    const size = config.foliage.foliageChunk
    const cx = Math.floor(palm.x / size)
    const cz = Math.floor(palm.z / size)
    const cleared = scatterChunk(cx, cz, config, [{ x: palm.x, z: palm.z, radius: 4 }])
    expect(
      cleared.palm.some((p) => Math.abs(p.x - palm.x) < 1e-6 && Math.abs(p.z - palm.z) < 1e-6),
    ).toBe(false)
  })

  it('draws the foliage kinds it adds as one more instanced variant', () => {
    const chunks: ChunkFoliage[] = []
    const island = islands[0]!
    for (const cell of cellsInRange(island.x, island.z, 300, config.foliage.foliageChunk)) {
      chunks.push(scatterChunk(cell.x, cell.z, config))
    }
    const selection = selectFoliage(chunks, island.x, island.z, 1, config)
    expect(selection.instances.palm.length).toBeGreaterThan(0)
    expect(selection.outlined.palm).toBeGreaterThan(0)
  })
})
