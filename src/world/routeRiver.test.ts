import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { ROUTE } from './route'
import {
  DITCH_FADE,
  applyRiverLake,
  applyRouteRiver,
  noiseRiverSuppression,
  riverBed,
  riverLakeCenter,
  riverTaper,
} from './routeRiver'
import { valleyAt, type ValleyHit } from './routeValley'
import { plungePoolCenter } from './stations'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG
const river = config.river
const water = config.waterLevel
const valley = config.valley
const lake = riverLakeCenter(config)
const pool = plungePoolCenter(config.plungePool)
/** m from the centreline where the banks have eased back into the floor */
const bankTop = river.halfWidth + river.bankWidth
const fullFloor = water + river.fullBand
const dryFloor = water + river.dryBand

/** World position `lateral` m to the left of the route at arc length `s`. */
function across(s: number, lateral: number): [number, number] {
  const p = ROUTE.pointAt(s)
  const t = ROUTE.tangentAt(s)
  return [p.x - t.z * lateral, p.z + t.x * lateral]
}

const inLake = (x: number, z: number): boolean =>
  Math.hypot(x - lake.x, z - lake.z) < river.lake.outerRadius
const inPool = (x: number, z: number): boolean =>
  Math.hypot(x - pool.x, z - pool.z) < config.plungePool.outerRadius

const hitAt = (lateral: number, floorHeight: number, weight = 1): ValleyHit => ({
  nearest: { s: 0, lateral, floorHeight, valleyWidth: 480 },
  weight,
  rival: null,
  rivalWeight: 0,
  rivalPull: 0,
})

/** Taper along the route centreline, with the valley's own weight (0 in the basin). */
function taperAt(s: number): number {
  const [x, z] = across(s, 0)
  const hit = valleyAt(x, z, config)
  return hit ? riverTaper(hit.nearest.floorHeight, hit.weight, river, water) : 0
}

describe('river config', () => {
  it('fades the dry ditch in above the water, and keeps the channel on the valley floor', () => {
    // The bed reaches the water this far up the taper. The ditch must be fully dug by then.
    expect(river.endLift / (river.depth + river.endLift)).toBeGreaterThan(DITCH_FADE)
    expect(river.fullBand).toBeLessThan(river.dryBand)
    // The narrowest floor still holds the channel and its banks with room to spare.
    let narrowest = Infinity
    for (let s = 0; s < ROUTE.length; s += 10) {
      narrowest = Math.min(narrowest, ROUTE.pointAt(s).valleyWidth)
    }
    expect(bankTop).toBeLessThan(narrowest / 4)
  })
})

describe('riverTaper and riverBed', () => {
  it('runs at full depth through the low band and is gone above it', () => {
    expect(riverTaper(fullFloor, 1, river, water)).toBe(1)
    expect(riverTaper(water + 1, 1, river, water)).toBe(1)
    expect(riverTaper(dryFloor, 1, river, water)).toBe(0)
    expect(riverTaper(60, 1, river, water)).toBe(0)
    expect(riverTaper(fullFloor, 0, river, water)).toBe(0)
    expect(riverBed(1, river, water)).toBe(water - river.depth)
    expect(riverBed(0, river, water)).toBe(water + river.endLift)
  })
})

describe('applyRouteRiver', () => {
  it('cuts a flat bed under the water on the centreline and leaves the floor past the banks', () => {
    for (const lateral of [0, river.halfWidth * 0.9, -river.halfWidth * 0.9]) {
      expect(applyRouteRiver(34, hitAt(lateral, 34), config)).toBe(water - river.depth)
    }
    expect(applyRouteRiver(34, hitAt(bankTop, 34), config)).toBe(34)
    expect(applyRouteRiver(34, hitAt(-bankTop - 10, 34), config)).toBe(34)
  })

  it('eases the banks from the bed to the floor without a step', () => {
    let last = applyRouteRiver(34, hitAt(0, 34), config)
    for (let lateral = 0.5; lateral <= bankTop + 5; lateral += 0.5) {
      const h = applyRouteRiver(34, hitAt(lateral, 34), config)
      expect(h).toBeGreaterThanOrEqual(last)
      expect(h - last).toBeLessThan(0.5)
      last = h
    }
  })

  it('leaves the ground alone above the low band and outside the valley', () => {
    expect(applyRouteRiver(40, hitAt(0, dryFloor), config)).toBe(40)
    expect(applyRouteRiver(40, hitAt(0, 50), config)).toBe(40)
    expect(applyRouteRiver(34, hitAt(0, 34, 0), config)).toBe(34)
  })

  it('tapers out above the water as the floor rises, never into a pit', () => {
    // From full depth to nothing, the bed only rises and the cut only shrinks.
    let lastBed = -Infinity
    for (let floor = fullFloor; floor <= dryFloor; floor += 0.05) {
      const bed = applyRouteRiver(floor + 1, hitAt(0, floor), config)
      expect(bed).toBeGreaterThanOrEqual(lastBed - 1e-9)
      lastBed = bed
      // Once the bed has risen out of the water, so has every point across the channel.
      if (bed >= water) {
        for (let lateral = 0; lateral <= bankTop; lateral += 5) {
          expect(applyRouteRiver(floor + 1, hitAt(lateral, floor), config)).toBeGreaterThanOrEqual(
            water,
          )
        }
      }
    }
  })
})

describe('applyRiverLake', () => {
  it('scoops a bed under the water at the return notch and fades out by its outer radius', () => {
    expect(applyRiverLake(lake.x, lake.z, 35, config)).toBe(water - river.lake.depth)
    expect(applyRiverLake(lake.x + river.lake.outerRadius, lake.z, 35, config)).toBe(35)
    expect(applyRiverLake(lake.x, lake.z, 10, config)).toBe(10)
  })
})

describe('noiseRiverSuppression', () => {
  it('holds the noise rivers back over the floor and walls, easing out at the valley edge', () => {
    const halfFloor = 240
    const shoulder = halfFloor + valley.flankWidth * valley.wallShare
    expect(noiseRiverSuppression(hitAt(0, 50), valley)).toBe(1)
    expect(noiseRiverSuppression(hitAt(-shoulder, 50), valley)).toBe(1)
    expect(noiseRiverSuppression(hitAt(halfFloor + valley.flankWidth, 50), valley)).toBe(0)
    expect(noiseRiverSuppression(hitAt(0, 50, 0.5), valley)).toBe(0.5)
  })

  it('counts the other stretch inside a tight bend, as far as the valley blends it in', () => {
    const hit: ValleyHit = {
      ...hitAt(1000, 50),
      rival: { s: 100, lateral: 0, floorHeight: 50, valleyWidth: 480 },
      rivalWeight: 1,
      rivalPull: 0.4,
    }
    expect(noiseRiverSuppression(hit, valley)).toBeCloseTo(0.4)
  })
})

describe('route river in the terrain', () => {
  // The two low reaches of `docs/world-route.md`, where the river is at full depth.
  const fullReaches = (): number[] => {
    const reaches: number[] = []
    for (let s = 0; s < ROUTE.length; s += 25) if (taperAt(s) === 1) reaches.push(s)
    return reaches
  }

  it('runs the bed under the water along the low stretches, the banks above it', () => {
    const reaches = fullReaches()
    // Both the east and the west reach, a kilometre or more each.
    expect(reaches.length * 25).toBeGreaterThan(2000)
    expect(reaches.some((s) => s > 5000 && s < 7000)).toBe(true)
    expect(reaches.some((s) => s > 11800 && s < 12800)).toBe(true)
    for (const s of reaches) {
      const [x, z] = across(s, 0)
      expect(heightAt(x, z, config)).toBeLessThanOrEqual(water - river.depth + 1e-9)
      for (const side of [-1, 1]) {
        const [bx, bz] = across(s, side * bankTop)
        if (inLake(bx, bz)) continue
        expect(heightAt(bx, bz, config)).toBeGreaterThan(water)
      }
    }
  })

  it('has no channel outside the low stretches', () => {
    for (let s = 0; s < ROUTE.length; s += 25) {
      if (ROUTE.pointAt(s).floorHeight < dryFloor) continue
      for (const lateral of [-bankTop, -river.halfWidth, 0, river.halfWidth, bankTop]) {
        const [x, z] = across(s, lateral)
        const hit = valleyAt(x, z, config)
        if (hit) {
          // Exactly what the valley alone would give.
          expect(applyRouteRiver(1000, hit, config)).toBe(1000)
        }
        if (inPool(x, z) || inLake(x, z)) continue
        expect(heightAt(x, z, config)).toBeGreaterThan(water)
      }
    }
  })

  it('ends cleanly: two unbroken reaches, the west one into the lake', () => {
    // Along the centreline, count where it goes in and out of the water.
    const wet = (s: number) => heightAt(...across(s, 0), config) < water
    const runs: { from: number; to: number }[] = []
    let start: number | null = null
    for (let s = 0; s <= ROUTE.length; s += 5) {
      if (wet(s) && start === null) start = s
      if (!wet(s) && start !== null) {
        runs.push({ from: start, to: s })
        start = null
      }
    }
    expect(runs).toHaveLength(2)
    const [east, west] = runs as [(typeof runs)[0], (typeof runs)[0]]
    // The east reach starts and ends on dry floor, clear of the waterfall's station (s 7100).
    expect(east.from).toBeGreaterThan(5000)
    expect(east.to).toBeLessThan(7050)
    // The west reach starts past the arch (s 11650) and runs into the lake.
    expect(west.from).toBeGreaterThan(11720)
    const [lx, lz] = across(west.to, 0)
    expect(Math.hypot(lx - lake.x, lz - lake.z)).toBeLessThan(river.lake.outerRadius)
    expect(heightAt(lake.x, lake.z, config)).toBe(water - river.lake.depth)
  })

  it('puts no water on the walls: only the channel, the lake and the pool are wet', () => {
    for (let s = 0; s < ROUTE.length; s += 20) {
      const { valleyWidth } = ROUTE.pointAt(s)
      const shoulder = valleyWidth / 2 + valley.flankWidth * valley.wallShare
      for (let lateral = -shoulder; lateral <= shoulder; lateral += 10) {
        const [x, z] = across(s, lateral)
        if (Math.abs(lateral) < bankTop || inLake(x, z) || inPool(x, z)) continue
        expect(heightAt(x, z, config)).toBeGreaterThanOrEqual(water)
      }
    }
  })

  it('keeps the cut continuous along the reaches and across the banks', () => {
    // Along the centreline through each taper: no step.
    let last = heightAt(...across(4800, 0), config)
    for (let s = 4801; s <= 7300; s += 1) {
      const h = heightAt(...across(s, 0), config)
      expect(Math.abs(h - last)).toBeLessThan(0.25)
      last = h
    }
    // Across a bank: smooth enough to read as a slope, never a ledge.
    for (const s of [5600, 6200, 12200]) {
      let previous = heightAt(...across(s, -bankTop - 20), config)
      for (let lateral = -bankTop - 19; lateral <= bankTop + 20; lateral += 1) {
        const h = heightAt(...across(s, lateral), config)
        expect(Math.abs(h - previous)).toBeLessThan(0.5)
        previous = h
      }
    }
  })

  it('gives the worker the same heights as the main thread', () => {
    const clone = structuredClone(config)
    for (let i = 0; i < 200; i++) {
      const s = 5000 + (i / 200) * 8000
      const [x, z] = across(s, Math.sin(i * 7.3) * 100)
      expect(heightAt(x, z, clone)).toBe(heightAt(x, z, config))
    }
  })
})
