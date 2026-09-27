import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { FOLIAGE_MODEL_BUILDERS, triangleCount } from './models/tree'
import {
  altitudeFalloff,
  cellsInRange,
  classifyGround,
  densityReach,
  distanceFalloff,
  FOLIAGE_KINDS,
  GroundPatch,
  growth,
  scatterChunk,
  scatterGrassTile,
  selectFoliage,
  selectGrass,
  type ChunkFoliage,
  type HeightSampler,
} from './scatter'
import { TERRAIN_CONFIG, type TerrainConfig } from './terrainConfig'

const config = TERRAIN_CONFIG
const f = config.foliage

/** A flat meadow comfortably above the water: grass band everywhere. */
const meadow: HeightSampler = () => config.waterLevel + 40

function allInstances(chunk: ChunkFoliage) {
  return FOLIAGE_KINDS.flatMap((kind) => chunk[kind])
}

describe('scatterChunk', () => {
  it('is deterministic per chunk key', () => {
    const a = scatterChunk(13, 15, config)
    const b = scatterChunk(13, 15, config)
    expect(b).toEqual(a)
    expect(allInstances(a).length).toBeGreaterThan(0)
  })

  it('gives different chunks different trees', () => {
    const a = allInstances(scatterChunk(13, 15, config, [], meadow))
    const b = allInstances(scatterChunk(14, 15, config, [], meadow))
    expect(a.map((i) => i.keep)).not.toEqual(b.map((i) => i.keep))
  })

  it('keeps every instance inside its chunk', () => {
    const size = f.foliageChunk
    for (const instance of allInstances(scatterChunk(-3, 7, config, [], meadow))) {
      expect(instance.x).toBeGreaterThanOrEqual(-3 * size)
      expect(instance.x).toBeLessThan(-2 * size)
      expect(instance.z).toBeGreaterThanOrEqual(7 * size)
      expect(instance.z).toBeLessThan(8 * size)
    }
  })

  it('never puts anything in or at the edge of the water', () => {
    // Every chunk around the spawn lake (1700, 2450), with the real heightfield.
    const cells = cellsInRange(1700, 2450, 400, f.foliageChunk)
    let checked = 0
    for (const cell of cells) {
      for (const instance of allInstances(scatterChunk(cell.x, cell.z, config))) {
        expect(instance.y).toBeGreaterThanOrEqual(config.waterLevel + f.shoreMargin)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('puts nothing under water even where the whole chunk is lake', () => {
    const lake: HeightSampler = () => config.waterLevel - 5
    expect(allInstances(scatterChunk(0, 0, config, [], lake))).toHaveLength(0)
    expect(scatterGrassTile(0, 0, config, [], lake)).toHaveLength(0)
  })

  it('grows boulders on rock and trees on grass, never the other way round', () => {
    // A 45° slope, below the snow line, is rock everywhere.
    const cliff: HeightSampler = (x) => config.waterLevel + 60 + x
    const rock = scatterChunk(0, 0, config, [], cliff)
    expect(rock.round.length + rock.conifer.length + rock.bush.length).toBe(0)
    expect(rock.boulder.length).toBeGreaterThan(0)
    const grass = scatterChunk(2, 2, config, [], meadow)
    expect(grass.boulder).toHaveLength(0)
  })

  it('puts conifers on high ground', () => {
    const count = (height: number) => {
      const chunks = cellsInRange(0, 0, 600, f.foliageChunk).map((c) =>
        scatterChunk(c.x, c.z, config, [], () => height),
      )
      const conifer = chunks.reduce((n, c) => n + c.conifer.length, 0)
      const round = chunks.reduce((n, c) => n + c.round.length, 0)
      return conifer / Math.max(1, conifer + round)
    }
    expect(count(config.waterLevel + 40)).toBeLessThan(0.2)
    expect(count(f.coniferHigh + 20)).toBeGreaterThan(0.8)
  })

  it('leaves exclusion zones empty', () => {
    const zone = { x: 64, z: 64, radius: 50 }
    const chunk = scatterChunk(0, 0, config, [zone], meadow)
    for (const instance of allInstances(chunk)) {
      expect(Math.hypot(instance.x - zone.x, instance.z - zone.z)).toBeGreaterThanOrEqual(50)
    }
    const cards = scatterGrassTile(1, 1, config, [zone], meadow)
    for (let c = 0; c < cards.length; c += 4) {
      const dx = (cards[c] ?? 0) - zone.x
      const dz = (cards[c + 2] ?? 0) - zone.z
      expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(50)
    }
  })

  it('keeps neighbours apart: a jittered grid, not clumps', () => {
    const cards = scatterGrassTile(0, 0, config, [], meadow)
    const pitch = f.grassTile / Math.round(f.grassTile / f.grassCell)
    let closest = Infinity
    for (let a = 0; a < cards.length; a += 4) {
      for (let b = a + 4; b < cards.length; b += 4) {
        const d = Math.hypot(
          (cards[a] ?? 0) - (cards[b] ?? 0),
          (cards[a + 2] ?? 0) - (cards[b + 2] ?? 0),
        )
        closest = Math.min(closest, d)
      }
    }
    expect(closest).toBeGreaterThanOrEqual(pitch * 0.2 - 1e-6)
  })
})

describe('GroundPatch', () => {
  it('matches the heightfield at lattice points', () => {
    const patch = new GroundPatch(1536, 1920, 128, config)
    expect(patch.surface(1544, 1928).height).toBeCloseTo(heightAt(1544, 1928, config), 3)
  })

  it('interpolates on the terrain triangles and reports slope', () => {
    const ramp: HeightSampler = (x) => x * 0.5
    const patch = new GroundPatch(0, 0, 64, config, ramp)
    const { height, slope } = patch.surface(13, 21)
    expect(height).toBeCloseTo(6.5, 6)
    expect(slope).toBeCloseTo(1 - 1 / Math.hypot(0.5, 1), 6)
  })
})

describe('classifyGround', () => {
  it('sorts water, sand, grass, rock and snow', () => {
    expect(classifyGround(config.waterLevel - 1, 0, config)).toBe('water')
    expect(classifyGround(config.waterLevel + 2.5, 0, config)).toBe('sand')
    expect(classifyGround(config.waterLevel + 40, 0, config)).toBe('grass')
    expect(classifyGround(config.waterLevel + 40, 0.5, config)).toBe('rock')
    expect(classifyGround(config.bands.snowHeight + 60, 0, config)).toBe('snow')
  })
})

describe('falloff', () => {
  it('draws everything near the plane and nothing at the edge', () => {
    expect(distanceFalloff(0, f.foliageFadeStart, f.foliageDistance)).toBe(1)
    expect(distanceFalloff(f.foliageFadeStart, f.foliageFadeStart, f.foliageDistance)).toBe(1)
    expect(distanceFalloff(f.foliageDistance, f.foliageFadeStart, f.foliageDistance)).toBe(0)
  })

  it('falls monotonically with distance', () => {
    let last = 1
    for (let d = 0; d <= f.foliageDistance; d += 50) {
      const share = distanceFalloff(d, f.foliageFadeStart, f.foliageDistance)
      expect(share).toBeLessThanOrEqual(last)
      last = share
    }
  })

  it('pulls the bands in with the governor density, so area follows density', () => {
    expect(densityReach(1)).toBe(1)
    expect(densityReach(0.6) ** 2).toBeCloseTo(0.6, 6)
    expect(densityReach(0.3) ** 2).toBeCloseTo(0.3, 6)
    const edge = f.foliageDistance * densityReach(0.6)
    expect(distanceFalloff(edge, f.foliageFadeStart, f.foliageDistance, densityReach(0.6))).toBe(0)
  })

  it('shrinks instances smoothly instead of popping them', () => {
    // A small change in share never jumps an instance by more than share / softness.
    for (let keep = 0; keep < 1; keep += 0.05) {
      for (let share = 0; share < 1; share += 0.01) {
        const step = Math.abs(growth(share + 0.01, keep) - growth(share, keep))
        expect(step).toBeLessThan(0.1)
      }
    }
    expect(growth(1, 0.99)).toBe(1)
    expect(growth(0, 0)).toBe(0)
  })

  it('has no grass at or above the altitude cutoff', () => {
    expect(altitudeFalloff(0, config)).toBe(1)
    expect(altitudeFalloff(f.grassAltitudeMax, config)).toBe(0)
    expect(altitudeFalloff(f.grassAltitudeMax + 50, config)).toBe(0)
    expect(altitudeFalloff(f.grassAltitudeFade + 20, config)).toBeLessThan(1)
  })
})

describe('selection', () => {
  const x = 1750
  const z = 1900
  const chunks = cellsInRange(x, z, f.foliageDistance, f.foliageChunk).map((c) =>
    scatterChunk(c.x, c.z, config),
  )

  it('orders instances nearest first and outlines only the near ones', () => {
    const { instances, outlined } = selectFoliage(chunks, x, z, 1, config)
    const round = instances.round
    expect(outlined.round).toBeLessThan(round.length)
    const d = (i: { x: number; z: number }) => Math.hypot(i.x - x, i.z - z)
    const near = round.slice(0, outlined.round)
    const far = round.slice(outlined.round)
    expect(Math.max(...near.map(d))).toBeLessThan(f.outlineDistance + f.foliageChunk * 1.5)
    expect(Math.min(...far.map(d))).toBeGreaterThan(f.outlineDistance - 1)
  })

  it('thins out with distance', () => {
    const { instances } = selectFoliage(chunks, x, z, 1, config)
    const inRing = (from: number, to: number) => {
      const count = instances.round.filter((i) => {
        const d = Math.hypot(i.x - x, i.z - z)
        return d >= from && d < to
      }).length
      return count / (Math.PI * (to * to - from * from))
    }
    expect(inRing(900, 1300)).toBeLessThan(inRing(0, 400) * 0.7)
  })

  it('draws fewer instances at lower governor density', () => {
    const total = (density: number) => {
      const { instances } = selectFoliage(chunks, x, z, density, config)
      return FOLIAGE_KINDS.reduce((n, kind) => n + instances[kind].length, 0)
    }
    expect(total(0.6)).toBeLessThan(total(1))
    expect(total(0.3)).toBeLessThan(total(0.6))
  })

  it('fills the grass buffer only up to its capacity', () => {
    const tiles = cellsInRange(x, z, f.grassDistance, f.grassTile).map((c) =>
      scatterGrassTile(c.x, c.z, config),
    )
    expect(selectGrass(tiles, x, z, 1, config, new Float32Array(40))).toBe(10)
  })
})

describe('budget at medium (density 1)', () => {
  const tris = Object.fromEntries(
    FOLIAGE_KINDS.map((kind) => [kind, triangleCount(FOLIAGE_MODEL_BUILDERS[kind]().body)]),
  ) as Record<(typeof FOLIAGE_KINDS)[number], number>

  function budget(x: number, y: number, z: number, c: TerrainConfig = config) {
    const chunks = cellsInRange(x, z, c.foliage.foliageDistance, c.foliage.foliageChunk).map(
      (cell) => scatterChunk(cell.x, cell.z, c),
    )
    const { instances, outlined } = selectFoliage(chunks, x, z, 1, c)
    const tiles = cellsInRange(x, z, c.foliage.grassDistance, c.foliage.grassTile).map((cell) =>
      scatterGrassTile(cell.x, cell.z, c),
    )
    const grass = selectGrass(tiles, x, z, 1, c, new Float32Array(9000 * 4))
    const grassOn = y - Math.max(heightAt(x, z, c), c.waterLevel) < c.foliage.grassAltitudeMax
    let triangles = grassOn ? grass * 4 : 0
    let draws = grassOn && grass > 0 ? 1 : 0
    for (const kind of FOLIAGE_KINDS) {
      triangles += (instances[kind].length + outlined[kind]) * tris[kind]
      draws += (instances[kind].length > 0 ? 1 : 0) + (outlined[kind] > 0 ? 1 : 0)
    }
    return { triangles, draws }
  }

  // The worst of the bookmarks: low-pass has the most grass, plateau the most conifers.
  it.each([
    ['spawn', 1750, 147, 2000],
    ['low-pass', 1750, 47, 1900],
    ['lake-bank', 1650, 85, 2200],
    ['plateau', -2250, 260, 700],
  ] as const)('%s stays under 12 draws and 120k triangles', (_name, x, y, z) => {
    const { triangles, draws } = budget(x, y, z)
    expect(draws).toBeLessThan(12)
    expect(triangles).toBeLessThan(120_000)
  })
})
