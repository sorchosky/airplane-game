import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { massifMask, regionMask, routeDistance } from './massifs'
import { ROUTE } from './route'
import { valleyReach } from './routeValley'
import { TERRAIN_CONFIG, type TerrainConfig } from './terrainConfig'

const config = TERRAIN_CONFIG
const massifs = config.massifs
const snow = config.bands.snowHeight
const flat: TerrainConfig = { ...config, massifs: { ...massifs, height: 0 } }

interface Summit {
  x: number
  z: number
  h: number
}

/** Local maxima above `floor` on a `step` grid round the loop, at least `apart` m from each other. */
function summits(step: number, floor: number, apart: number): Summit[] {
  const x0 = -4000
  const z0 = -6000
  const columns = Math.round(16000 / step)
  const rows = Math.round(16000 / step)
  const heights = new Float32Array(columns * rows)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++)
      heights[j * columns + i] = heightAt(x0 + i * step, z0 + j * step, config)
  }
  const found: Summit[] = []
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < columns - 1; i++) {
      const h = heights[j * columns + i]!
      if (h < floor) continue
      let top = true
      for (let b = -1; b <= 1 && top; b++) {
        for (let a = -1; a <= 1; a++) {
          if ((a || b) && heights[(j + b) * columns + i + a]! > h) top = false
        }
      }
      if (top) found.push({ x: x0 + i * step, z: z0 + j * step, h })
    }
  }
  found.sort((a, b) => b.h - a.h)
  const kept: Summit[] = []
  for (const s of found) {
    if (kept.every((k) => Math.hypot(k.x - s.x, k.z - s.z) > apart)) kept.push(s)
  }
  return kept
}

/** True when the summit's top is in sight from some point on the loop, 50 m over the floor. */
function seenFromLoop(summit: Summit): boolean {
  for (let s = 0; s < ROUTE.length; s += 200) {
    const p = ROUTE.pointAt(s)
    const eye = p.floorHeight + 50
    const distance = Math.hypot(summit.x - p.x, summit.z - p.z)
    if (distance > 8000) continue
    let clear = true
    for (let d = 50; d < distance - 100 && clear; d += 50) {
      const f = d / distance
      const line = eye + (summit.h - eye) * f
      if (heightAt(p.x + (summit.x - p.x) * f, p.z + (summit.z - p.z) * f, config) > line) {
        clear = false
      }
    }
    if (clear) return true
  }
  return false
}

const found = summits(50, snow, 800)

describe('massifs', () => {
  it('raises peaks to 450 m and more, under the 600 m flight ceiling', () => {
    const tallest = found[0]!
    expect(tallest.h).toBeGreaterThan(450)
    expect(tallest.h).toBeLessThan(600)
  })

  it('puts at least 3 summits over the snow line in sight of the loop', () => {
    let seen = 0
    for (const summit of found) {
      if (seenFromLoop(summit)) seen++
      if (seen >= 3) break
    }
    expect(seen).toBeGreaterThanOrEqual(3)
  })

  it('is zero inside the route valley, out to its flank fade', () => {
    const reach = valleyReach(config)
    for (let s = 0; s < ROUTE.length; s += 50) {
      const p = ROUTE.pointAt(s)
      const t = ROUTE.tangentAt(s)
      for (const lateral of [-reach, -reach / 2, 0, reach / 2, reach]) {
        const x = p.x - t.z * lateral
        const z = p.z + t.x * lateral
        expect(routeDistance(x, z, config)).toBeLessThanOrEqual(reach + 1)
        expect(massifMask(x, z, x, z, config)).toBe(0)
      }
    }
  })

  it('leaves the valley walls (#221) exactly as authored', () => {
    const reach = valleyReach(config)
    for (let s = 0; s < ROUTE.length; s += 97) {
      const p = ROUTE.pointAt(s)
      const t = ROUTE.tangentAt(s)
      for (const lateral of [-reach, -300, 300, reach]) {
        const x = p.x - t.z * lateral
        const z = p.z + t.x * lateral
        expect(heightAt(x, z, config)).toBe(heightAt(x, z, flat))
      }
    }
  })

  it('rises into a massif inside the ring, between the basin and the valley', () => {
    const inner = massifs.regions.find((region) => region.name === 'inner')!
    let tallest = 0
    for (let x = inner.x - inner.radiusX; x <= inner.x + inner.radiusX; x += 50) {
      for (let z = inner.z - inner.radiusZ; z <= inner.z + inner.radiusZ; z += 50) {
        tallest = Math.max(tallest, heightAt(x, z, config))
      }
    }
    expect(tallest).toBeGreaterThan(450)
  })

  it('flanks the loop with mountains on both sides for at least 40 % of its length', () => {
    // A side counts when ground over the snow line stands within 3 km, in a ±60° fan square to it.
    const side = (x: number, z: number, tx: number, tz: number, sign: number): boolean => {
      for (let angle = -60; angle <= 60; angle += 30) {
        const c = Math.cos((angle * Math.PI) / 180)
        const sn = Math.sin((angle * Math.PI) / 180)
        const dx = -sign * tz * c + tx * sn
        const dz = sign * tx * c + tz * sn
        for (let d = 200; d <= 3000; d += 100) {
          if (heightAt(x + dx * d, z + dz * d, config) >= snow) return true
        }
      }
      return false
    }
    let both = 0
    let total = 0
    for (let s = 0; s < ROUTE.length; s += 100) {
      const p = ROUTE.pointAt(s)
      const t = ROUTE.tangentAt(s)
      total++
      if (side(p.x, p.z, t.x, t.z, 1) && side(p.x, p.z, t.x, t.z, -1)) both++
    }
    expect(both / total).toBeGreaterThanOrEqual(0.4)
  })

  it('keeps the inland sea (#223) clear, with a 300 m margin', () => {
    const { sea } = massifs
    expect(sea.margin).toBeGreaterThanOrEqual(300)
    for (let x = sea.minX - 300; x <= sea.maxX + 300; x += 100) {
      for (let z = sea.minZ - 300; z <= sea.maxZ + 300; z += 100) {
        expect(massifMask(x, z, x, z, config)).toBe(0)
      }
    }
  })

  it('frames the coast with massifs north and south of the sea, not in front of it', () => {
    const { sea } = massifs
    const north = found.filter(
      (s) => s.z < sea.minZ - sea.margin && s.x > sea.minX && s.x < sea.maxX,
    )
    const south = found.filter(
      (s) => s.z > sea.maxZ + sea.margin && s.x > sea.minX && s.x < sea.maxX,
    )
    expect(north.length).toBeGreaterThan(0)
    expect(south.length).toBeGreaterThan(0)
  })

  it('is zero inside the home basin', () => {
    const { basin } = config
    for (let r = 0; r <= basin.blendRadius; r += 100) {
      for (let a = 0; a < 360; a += 10) {
        const x = basin.centerX + r * Math.sin((a * Math.PI) / 180)
        const z = basin.centerZ - r * Math.cos((a * Math.PI) / 180)
        expect(massifMask(x, z, x, z, config)).toBe(0)
      }
    }
  })

  it('wraps seamlessly: a massif repeats one period over', () => {
    const P = config.worldPeriod
    for (const s of found.slice(0, 5)) {
      const h = heightAt(s.x, s.z, config)
      for (const [dx, dz] of [
        [P, 0],
        [0, -P],
        [-P, P],
      ] as const) {
        expect(heightAt(s.x + dx, s.z + dz, config)).toBeCloseTo(h, 6)
      }
    }
  })

  it('reads regions as soft ellipses: full at the core, gone past the rim', () => {
    const region = massifs.regions[0]!
    expect(regionMask(region.x, region.z, massifs)).toBe(1)
    expect(regionMask(region.x + region.radiusX * 1.01, region.z, massifs)).toBe(0)
    const rim = regionMask(region.x, region.z + region.radiusZ * 0.8, massifs)
    expect(rim).toBeGreaterThan(0)
    expect(rim).toBeLessThan(1)
  })
})
