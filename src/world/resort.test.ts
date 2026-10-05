import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { buildPalm } from './models/palm'
import { buildResort } from './models/resort'
import { triangleCount } from './models/foliage'
import { getResort, resortIsland } from './resort'
import { allFoliageExclusions } from './foliageExclusions'
import { cellsInRange, isExcluded, scatterChunk, selectFoliage } from './scatter'
import { seaIslands } from './sea'
import { SHOT_BOOKMARKS } from '../debug/shots'
import { islandWeightAt, terrainBandWeights } from './terrainColor'
import { TERRAIN_CONFIG as config } from './terrainConfig'

const resort = getResort()
const island = resortIsland(config)

describe('the resort (#235)', () => {
  it('stands on the largest island, the lodge on dry land and the rest inside its shallows', () => {
    const largest = seaIslands(config).reduce((a, b) => (b.radius > a.radius ? b : a))
    expect(resort.island.name).toBe(largest.name)
    expect(island.name).toBe('Long Isle')
    const lodge = Math.hypot(resort.x - island.x, resort.z - island.z)
    expect(lodge).toBeLessThan(island.radius)
    expect(resort.y - config.waterLevel).toBeGreaterThan(1.5)
    const shallows = config.sea!.islands.find((i) => i.name === island.name)!.shallows
    for (const f of resort.footprints) {
      const reach = Math.hypot(f.x - island.x, f.z - island.z) + f.radius
      expect(reach).toBeLessThan(island.maxRadius + shallows)
    }
  })

  it('keeps its bungalows and jetty over water and its boardwalk starting on the beach', () => {
    const water = resort.layout.waterHeight
    for (const b of resort.layout.bungalows) {
      expect(resort.ground(b.x, b.z)).toBeLessThan(water)
      expect(b.floor).toBeGreaterThan(water + 1)
    }
    expect(resort.layout.bungalows.length).toBeGreaterThanOrEqual(4)
    expect(resort.layout.bungalows.length).toBeLessThanOrEqual(6)
    const nodes = resort.layout.boardwalk.nodes
    expect(resort.ground(nodes[0]!.x, nodes[0]!.z)).toBeGreaterThan(water)
    expect(resort.ground(resort.layout.jetty.to.x, resort.layout.jetty.to.z)).toBeLessThan(water)
  })

  const geometry = buildResort(resort.layout, resort.ground)
  const resortTriangles = triangleCount(geometry)

  it('stays within 4,000 triangles, as a mergeable non-indexed part', () => {
    expect(resortTriangles).toBeLessThanOrEqual(4000)
    expect(geometry.index).toBeNull()
    for (const name of ['position', 'normal', 'color', 'glow']) {
      expect(geometry.getAttribute(name).count).toBe(geometry.getAttribute('position').count)
    }
  })

  it('lights its windows and a string of lanterns with the glow mask, and no more than that', () => {
    const glow = geometry.getAttribute('glow')
    let lit = 0
    for (let i = 0; i < glow.count; i++) if (glow.getX(i) > 0) lit++
    // Windows (lodge 6, bungalows 3 each) and at least eight lanterns, 12 triangles apiece.
    expect(lit / 36).toBeGreaterThanOrEqual(6 + resort.layout.bungalows.length * 3 + 8)
    expect(lit).toBeLessThan(glow.count * 0.2)
    expect(resort.layout.lanterns.length).toBeGreaterThanOrEqual(8)
  })

  it('rises from the lodge to a thatched ridge that reads as a silhouette', () => {
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never)
    // The lodge's roof peaks over 9 m above its floor.
    expect(box.max.y).toBeGreaterThan(resort.layout.lodge.floor + 9)
  })

  it('keeps foliage off its footprint and boardwalk', () => {
    const zones = allFoliageExclusions()
    for (const f of resort.footprints) {
      expect(isExcluded(f.x, f.z, zones, config.worldPeriod)).toBe(true)
    }
    const size = config.foliage.foliageChunk
    const chunk = scatterChunk(
      Math.floor(resort.x / size),
      Math.floor(resort.z / size),
      config,
      zones,
    )
    for (const palm of chunk.palm) {
      for (const f of resort.footprints) {
        expect(Math.hypot(palm.x - f.x, palm.z - f.z)).toBeGreaterThan(f.radius)
      }
    }
  })

  it('adds at most 30k triangles at the island-resort bookmark: resort twice, palms body and hull', () => {
    const shot = SHOT_BOOKMARKS.find((s) => s.name === 'island-resort')!
    const [x, , z] = shot.position
    const f = config.foliage
    const chunks = cellsInRange(x, z, f.foliageDistance, f.foliageChunk).map((cell) =>
      scatterChunk(cell.x, cell.z, config, allFoliageExclusions()),
    )
    const selection = selectFoliage(chunks, x, z, 1, config)
    const palm = triangleCount(buildPalm().body)
    const palms = (selection.instances.palm.length + selection.outlined.palm) * palm
    // The resort's solid and its outline hull both draw it.
    const total = 2 * resortTriangles + palms
    expect(selection.instances.palm.length).toBeGreaterThan(40)
    expect(total).toBeLessThanOrEqual(30000)
  })

  it('has bookmarks: the close pass at about 150 m, and the view from the town station', () => {
    const near = SHOT_BOOKMARKS.find((s) => s.name === 'island-resort')!
    const lodge = resort
    expect(Math.hypot(near.position[0] - lodge.x, near.position[2] - lodge.z)).toBeLessThan(250)
    for (const name of ['resort-mid', 'resort-far']) {
      expect(
        SHOT_BOOKMARKS.some((s) => s.name === name),
        name,
      ).toBe(true)
    }
  })
})

describe('tropical beaches (#235)', () => {
  const water = config.waterLevel
  /** m from the waterline inland to where the sand gives way, along a bearing from the centre. */
  function beachWidth(
    island: { x: number; z: number; maxRadius: number },
    bearing: number,
    noise: number,
  ) {
    const dx = Math.sin(bearing)
    const dz = -Math.cos(bearing)
    let shore = -1
    let sandEnd = -1
    for (let r = island.maxRadius + 30; r > 0; r -= 1) {
      const x = island.x + dx * r
      const z = island.z + dz * r
      const h = heightAt(x, z, config)
      if (shore < 0 && h > water) shore = r
      const w = terrainBandWeights(h, 0, noise, config, islandWeightAt(x, z, config))
      if (shore >= 0 && w.sand < 0.5) {
        sandEnd = r
        break
      }
    }
    return shore - sandEnd
  }

  it('runs 30 to 80 m from the waterline on every island, whichever way the noise nudges it', () => {
    for (const site of seaIslands(config)) {
      for (let a = 0; a < 360; a += 15) {
        for (const noise of [-1, 0, 1]) {
          const width = beachWidth(site, (a * Math.PI) / 180, noise)
          expect(width, `${site.name} ${a}° noise ${noise}`).toBeGreaterThanOrEqual(30)
          expect(width, `${site.name} ${a}° noise ${noise}`).toBeLessThanOrEqual(80)
        }
      }
    }
  })

  it('uses the tropical sand only within the island radii', () => {
    const site = seaIslands(config)[0]!
    expect(islandWeightAt(site.x, site.z, config)).toBe(1)
    expect(islandWeightAt(site.x + site.maxRadius, site.z, config)).toBe(1)
    expect(islandWeightAt(site.x + site.maxRadius + config.bands.islandFade, site.z, config)).toBe(
      0,
    )
    // Out on the plain and by the town: none.
    expect(islandWeightAt(0, 0, config)).toBe(0)
    expect(islandWeightAt(5343, 1416, config)).toBe(0)
    // And it wraps with the world.
    expect(islandWeightAt(site.x + config.worldPeriod, site.z, config)).toBe(1)
  })
})
