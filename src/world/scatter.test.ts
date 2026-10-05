import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { buildCanopyBlob, FOLIAGE_MODEL_BUILDERS, triangleCount } from './models/foliage'
import {
  cellsInRange,
  classifyGround,
  densityReach,
  distanceFalloff,
  FOLIAGE_KINDS,
  GroundPatch,
  groveAt,
  growth,
  isExcluded,
  blobMayGrow,
  canopyShare,
  scatterBlobCell,
  scatterChunk,
  selectBlobs,
  selectFoliage,
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
    // The first chunk near the spawn that holds anything: the rest of them are meadow.
    const cell = cellsInRange(1750, 2000, 600, f.foliageChunk).find(
      (c) => allInstances(scatterChunk(c.x, c.z, config)).length > 0,
    )
    expect(cell).toBeDefined()
    const a = scatterChunk(cell!.x, cell!.z, config)
    const b = scatterChunk(cell!.x, cell!.z, config)
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
  })
})

describe('groves (#232)', () => {
  // A 20 × 20 block of foliage chunks of flat grass, about 6.5 km².
  const chunks: { cx: number; cz: number; foliage: ChunkFoliage }[] = []
  for (let cz = 0; cz < 20; cz++) {
    for (let cx = 0; cx < 20; cx++) {
      chunks.push({ cx, cz, foliage: scatterChunk(cx, cz, config, [], meadow) })
    }
  }
  const trees = chunks.flatMap(({ foliage }) => [...foliage.round, ...foliage.conifer])

  it('puts at least 70% of the trees inside groves', () => {
    const inGrove = trees.filter((t) => groveAt(t.x, t.z, config) >= f.groveLow)
    expect(trees.length).toBeGreaterThan(500)
    expect(inGrove.length / trees.length).toBeGreaterThanOrEqual(0.7)
  })

  it('leaves the meadows between groves under 5% of the old tree density', () => {
    const pitch = f.foliageChunk / Math.round(f.foliageChunk / f.treeCell)
    let meadowCells = 0
    for (let j = 0; j < 20 * 8; j++) {
      for (let i = 0; i < 20 * 8; i++) {
        if (groveAt((i + 0.5) * pitch, (j + 0.5) * pitch, config) < f.groveLow) meadowCells++
      }
    }
    const meadowTrees = trees.filter((t) => groveAt(t.x, t.z, config) < f.groveLow)
    expect(meadowCells).toBeGreaterThan(5000)
    // 0.24 is `treeDensity` before groves were clumped.
    expect(meadowTrees.length / meadowCells).toBeLessThan(0.05 * 0.24)
  })

  it('keeps bushes out of deep meadow too', () => {
    const deep = chunks
      .flatMap(({ foliage }) => foliage.bush)
      .filter((b) => groveAt(b.x, b.z, config) < f.groveLow - 0.12)
    const cells = chunks.length * 64
    expect(deep.length / cells).toBeLessThan(0.05 * 0.24)
  })

  it('has conifers dominate above the conifer line', () => {
    const share = (height: number) => {
      const set = cellsInRange(0, 0, 600, f.foliageChunk).map((c) =>
        scatterChunk(c.x, c.z, config, [], () => height),
      )
      const conifer = set.reduce((n, c) => n + c.conifer.length, 0)
      const round = set.reduce((n, c) => n + c.round.length, 0)
      return conifer / Math.max(1, conifer + round)
    }
    expect(share((f.coniferLow + f.coniferHigh) / 2)).toBeGreaterThan(0.5)
    expect(share(f.coniferHigh)).toBeGreaterThan(0.9)
  })
})

describe('canopy blobs (#232)', () => {
  const blobCells = (x: number, z: number, distance: number, exclusions: never[] = []) =>
    cellsInRange(x, z, distance, f.blobCell).map((cell) =>
      scatterBlobCell(cell.x, cell.z, config, exclusions),
    )

  it('switches from trees to blobs with no gap: trees are gone where blobs are full', () => {
    expect(canopyShare(f.blobFadeIn, config)).toBe(0)
    expect(canopyShare(f.foliageDistance, config)).toBe(1)
    expect(distanceFalloff(f.foliageDistance, f.foliageFadeStart, f.foliageDistance)).toBe(0)
    // Blobs are full from the trees' reach out to where they thin, then gone at `blobDistance`.
    expect(canopyShare(f.blobFadeStart, config)).toBe(1)
    expect(canopyShare(f.blobDistance, config)).toBe(0)
    let last = 0
    for (let d = f.blobFadeIn; d <= f.foliageDistance; d += 25) {
      const share = canopyShare(d, config)
      expect(share).toBeGreaterThanOrEqual(last)
      last = share
    }
  })

  it('pulls the switch in with the governor density, trees and blobs together', () => {
    const reach = densityReach(0.5)
    expect(canopyShare(f.blobFadeIn * reach, config, reach)).toBe(0)
    expect(canopyShare(f.foliageDistance * reach, config, reach)).toBe(1)
    expect(
      distanceFalloff(f.foliageDistance * reach, f.foliageFadeStart, f.foliageDistance, reach),
    ).toBe(0)
  })

  it('finds a blob in a grove, sized inside its limits, and none in the meadow', () => {
    const found = blobCells(1750, 2000, f.blobDistance).flat()
    expect(found.length).toBeGreaterThan(20)
    for (const blob of found) {
      expect(blob.radius).toBeGreaterThanOrEqual(f.blobRadiusMin)
      expect(blob.radius).toBeLessThanOrEqual(f.blobRadiusMax)
      expect(blob.keep).toBeGreaterThanOrEqual(0)
      expect(blob.keep).toBeLessThan(1)
    }
    // At most one blob per cell, so a grove a few cells across is a few blobs.
    for (const cell of blobCells(1750, 2000, f.blobDistance))
      expect(cell.length).toBeLessThanOrEqual(1)
    expect(scatterBlobCell(0, 0, config, [], () => config.waterLevel - 5)).toHaveLength(0)
    const cliff: HeightSampler = (x) => config.waterLevel + 60 + x
    expect(scatterBlobCell(0, 0, config, [], cliff)).toHaveLength(0)
  })

  it('is deterministic, repeats every world period and respects exclusions', () => {
    const cell = cellsInRange(1750, 2000, f.blobDistance, f.blobCell).find(
      (c) => scatterBlobCell(c.x, c.z, config).length > 0,
    )!
    const here = scatterBlobCell(cell.x, cell.z, config, [], meadow)
    expect(scatterBlobCell(cell.x, cell.z, config, [], meadow)).toEqual(here)
    const cells = config.worldPeriod / f.blobCell
    const copy = scatterBlobCell(cell.x + cells, cell.z, config, [], meadow)
    expect(copy).toHaveLength(here.length)
    if (here[0] && copy[0]) {
      expect(copy[0].x - here[0].x).toBeCloseTo(config.worldPeriod, 4)
      expect(copy[0].keep).toBe(here[0].keep)
      expect(copy[0].radius).toBeCloseTo(here[0].radius, 6)
    }
    const zone = {
      x: cell.x * f.blobCell + f.blobCell / 2,
      z: cell.z * f.blobCell + f.blobCell / 2,
      radius: 2 * f.blobCell,
    }
    expect(scatterBlobCell(cell.x, cell.z, config, [zone], meadow)).toHaveLength(0)
  })

  it("draws no blobs inside the trees' reach and thins them at lower density", () => {
    const x = 1750
    const z = 2000
    const cells = blobCells(x, z, f.blobDistance)
    const full = selectBlobs(cells, x, z, 1, config)
    expect(full.blobs.length).toBeGreaterThan(20)
    const nearest = Math.min(...full.blobs.map((b) => Math.hypot(b.x - x, b.z - z)))
    expect(nearest).toBeGreaterThan(f.blobFadeIn - f.foliageChunk * 1.5)
    expect(full.outlined).toBeLessThanOrEqual(full.blobs.length)
    expect(selectBlobs(cells, x, z, 0.3, config).blobs.length).toBeLessThan(full.blobs.length)
  })

  it('keeps a blob that can only grow once the plane has moved off its nearest point', () => {
    // The share rises then falls, so a blob whose nearest distance is inside the fade-in can
    // still be wanted when the plane sits farther out in its cell.
    const keep = 0.2
    expect(growth(canopyShare(f.blobFadeIn - 20, config), keep)).toBe(0)
    expect(blobMayGrow(f.blobFadeIn - 20, keep, config, 1)).toBe(true)
    expect(blobMayGrow(f.blobDistance + 50, keep, config, 1)).toBe(false)
  })

  it('stands on the ground: no ground under it pokes through the crown or hangs from the foot', () => {
    const found = blobCells(1750, 2000, f.blobDistance).flat()
    expect(found.length).toBeGreaterThan(20)
    for (const blob of found) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4
        const ground = heightAt(
          blob.x + Math.cos(a) * blob.radius * 0.7,
          blob.z + Math.sin(a) * blob.radius * 0.7,
          config,
        )
        expect(ground).toBeGreaterThanOrEqual(blob.y)
        expect(ground).toBeLessThan(blob.y + blob.height)
      }
      // 3 m of foot under the lowest ground, 30 m of relief at most, a canopy's depth over it.
      expect(blob.height).toBeLessThan(3 + f.blobRelief + 12 + f.blobRadiusMax * 0.12 + 0.01)
    }
  })

  it('costs few triangles', () => {
    expect(triangleCount(buildCanopyBlob().body)).toBeLessThanOrEqual(120)
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
})

describe('budget at medium (density 1)', () => {
  const tris = Object.fromEntries(
    FOLIAGE_KINDS.map((kind) => [kind, triangleCount(FOLIAGE_MODEL_BUILDERS[kind]().body)]),
  ) as Record<(typeof FOLIAGE_KINDS)[number], number>

  function budget(x: number, _y: number, z: number, c: TerrainConfig = config) {
    const chunks = cellsInRange(x, z, c.foliage.foliageDistance, c.foliage.foliageChunk).map(
      (cell) => scatterChunk(cell.x, cell.z, c),
    )
    const { instances, outlined } = selectFoliage(chunks, x, z, 1, c)
    let triangles = 0
    let draws = 0
    for (const kind of FOLIAGE_KINDS) {
      triangles += (instances[kind].length + outlined[kind]) * tris[kind]
      draws += (instances[kind].length > 0 ? 1 : 0) + (outlined[kind] > 0 ? 1 : 0)
    }
    return { triangles, draws }
  }

  // The worst of the bookmarks: plateau has the most conifers.
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

describe('wrapping world (#176)', () => {
  const P = config.worldPeriod

  it('fits a whole number of scatter cells into a world period', () => {
    const pitch = f.foliageChunk / Math.max(1, Math.round(f.foliageChunk / f.treeCell))
    expect(Number.isInteger(P / pitch)).toBe(true)
  })

  it('grows the same foliage one period over', () => {
    // A period is not a whole number of foliage chunks, so compare a strip by position.
    const strip = (cx0: number, minX: number) =>
      [0, 1, 2]
        .flatMap((k) => allInstances(scatterChunk(cx0 + k, 4, config, [], meadow)))
        .filter((i) => i.x >= minX && i.x < minX + 200)
        .map((i) => ({ ...i, x: i.x - minX }))
        .sort((a, b) => a.x - b.x || a.z - b.z)
    const home = strip(0, 20)
    const copy = strip(Math.floor((P + 20) / f.foliageChunk), P + 20)
    expect(home.length).toBeGreaterThan(5)
    expect(copy).toHaveLength(home.length)
    copy.forEach((instance, k) => {
      const original = home[k]!
      expect(instance.x).toBeCloseTo(original.x, 6)
      expect(instance.z).toBeCloseTo(original.z, 6)
      expect(instance.keep).toBe(original.keep)
      expect(instance.scale).toBe(original.scale)
    })
  })

  it('repeats the grove noise and keeps exclusions on every copy', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 731 - 5000
      const z = i * -293 + 3000
      expect(groveAt(x + P, z - P, config)).toBeCloseTo(groveAt(x, z, config), 9)
    }
    const zone = { x: 100, z: 200, radius: 30 }
    expect(isExcluded(100 + P, 200 - 2 * P, [zone], P)).toBe(true)
    expect(isExcluded(100 + P, 200, [zone])).toBe(false)
  })
})
