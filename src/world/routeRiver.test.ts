import { describe, expect, it } from 'vitest'
import { carveRivers, heightAt } from './heightfield'
import { ROUTE } from './route'
import { channelPresence, lakeSpot, noiseRiverKeep, withoutRouteRiver } from './routeRiver'
import { valleyProfileAt, type ValleyHit } from './routeValley'
import { inletSegment } from './sea'
import { plungePoolCenter } from './stations'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG
const dry = withoutRouteRiver(config)
const { river, valley, waterLevel } = config
const lake = lakeSpot(config)
const pool = plungePoolCenter(config.plungePool)
const cutS = ROUTE.nearest(config.basin.notches[0].x, config.basin.notches[0].z).s
const fullStart = cutS + valley.joinLength
const reach = river.halfWidth + river.bankWidth

/** World position `lateral` m to the left of the route at arc length `s`. */
function across(s: number, lateral: number): [number, number] {
  const p = ROUTE.pointAt(s)
  const t = ROUTE.tangentAt(s)
  return [p.x - t.z * lateral, p.z + t.x * lateral]
}

/** World position `lateral` m off the floor's carved centre (#221), which the river follows. */
function acrossCentre(s: number, lateral: number): [number, number] {
  return across(s, valleyProfileAt(s, config).offset + lateral)
}

const nearPool = (x: number, z: number) =>
  Math.hypot(x - pool.x, z - pool.z) < config.plungePool.outerRadius
const nearLake = (x: number, z: number) =>
  Math.hypot(x - lake.x, z - lake.z) < river.lake.outerRadius
// The inlet (#223) branches off the east reach to the sea, so its water crosses the east bank.
const inlet = inletSegment(config)
const inletReach = (config.sea?.inlet.halfWidth ?? 0) + (config.sea?.inlet.bankWidth ?? 0)
const nearInlet = (x: number, z: number) => {
  const bx = inlet.bx - inlet.ax
  const bz = inlet.bz - inlet.az
  const t = Math.max(
    0,
    Math.min(1, ((x - inlet.ax) * bx + (z - inlet.az) * bz) / (bx * bx + bz * bz)),
  )
  return Math.hypot(x - inlet.ax - bx * t, z - inlet.az - bz * t) < inletReach
}

// Every 25 m of route from the end of the cut's join to the lake, with the designed floor there.
const stations = Array.from({ length: Math.floor((lake.s - fullStart) / 25) }, (_, i) => {
  const s = fullStart + i * 25
  return { s, floor: ROUTE.pointAt(s).floorHeight }
})
const low = stations.filter(({ floor }) => floor <= waterLevel + river.fullFloor)
const high = stations.filter(({ floor }) => floor >= waterLevel + river.dryFloor)

describe('channelPresence', () => {
  it('is whole low in the band, none above it, and falls steadily between', () => {
    expect(channelPresence(waterLevel + 1, config)).toBe(1)
    expect(channelPresence(waterLevel + river.fullFloor, config)).toBe(1)
    expect(channelPresence(waterLevel + river.dryFloor, config)).toBe(0)
    expect(channelPresence(waterLevel + 40, config)).toBe(0)
    let previous = 1
    for (let h = waterLevel + river.fullFloor; h <= waterLevel + river.dryFloor; h += 0.1) {
      const p = channelPresence(h, config)
      expect(p).toBeLessThanOrEqual(previous)
      previous = p
    }
  })
})

describe('route river in the terrain', () => {
  it('has both low stretches to run through, and high floor to stay out of', () => {
    // East river head and reach, and the west reach into the return notch (docs/world-route.md).
    expect(low.some(({ s }) => s > 5000 && s < 7000)).toBe(true)
    expect(low.some(({ s }) => s > 11500 && s < lake.s)).toBe(true)
    expect(high.length).toBeGreaterThan(stations.length / 2)
  })

  it('cuts a bed below the water along the low stretches, with banks above it', () => {
    for (const { s } of low) {
      for (const lateral of [-river.halfWidth, 0, river.halfWidth]) {
        const h = heightAt(...acrossCentre(s, lateral), config)
        // The offset is read at `s`, the carve at the nearest point's `s`: a hair apart.
        expect(h).toBeLessThanOrEqual(waterLevel - river.depth + 1e-3)
      }
      for (const side of [-1, 1]) {
        const [x, z] = acrossCentre(s, side * reach)
        if (nearPool(x, z) || nearLake(x, z) || nearInlet(x, z)) continue
        expect(heightAt(x, z, config)).toBeGreaterThan(waterLevel)
      }
    }
  })

  it('leaves the floor alone where it is high', () => {
    for (const { s } of high) {
      for (const lateral of [-reach / 2, 0, reach / 2]) {
        const [x, z] = acrossCentre(s, lateral)
        expect(heightAt(x, z, config)).toBe(heightAt(x, z, dry))
      }
    }
  })

  it('keeps water off the flanks: none past the banks, none on a high floor', () => {
    for (const { s, floor } of stations) {
      const halfFloor = valleyProfileAt(s, config).halfWidth
      for (let lateral = -halfFloor; lateral <= halfFloor; lateral += 10) {
        const [x, z] = acrossCentre(s, lateral)
        if (nearPool(x, z) || nearLake(x, z) || nearInlet(x, z)) continue
        const wet = heightAt(x, z, config) < waterLevel
        if (Math.abs(lateral) >= reach) expect(wet).toBe(false)
        if (floor >= waterLevel + river.dryFloor) expect(wet).toBe(false)
      }
    }
  })

  it('tapers out on the floor where it rises: the water narrows to nothing, it never steps', () => {
    // Across each taper, the wet width only shrinks as the floor rises, and the bed at the
    // centre rises steadily through the water instead of stopping at a wall.
    const width = (s: number) => {
      let wet = 0
      for (let lateral = -reach; lateral <= reach; lateral += 2) {
        if (heightAt(...acrossCentre(s, lateral), config) < waterLevel) wet += 2
      }
      return wet
    }
    for (const [from, to, step] of [
      [5400, 4900, -10],
      [6500, 7300, 10],
      [12000, 11500, -10],
    ] as const) {
      let previousWidth = Infinity
      let previousBed = -Infinity
      for (let s = from; step > 0 ? s <= to : s >= to; s += step) {
        const [x, z] = acrossCentre(s, 0)
        if (nearPool(x, z)) continue
        const w = width(s)
        expect(w).toBeLessThanOrEqual(previousWidth + 2)
        const bed = heightAt(x, z, config)
        expect(Math.abs(bed - previousBed) < 1.5 || previousBed === -Infinity).toBe(true)
        previousWidth = w
        previousBed = bed
      }
      expect(previousWidth).toBe(0)
    }
  })

  it('runs into the lake without a break, and the lake shore is dry ground', () => {
    // The centre line stays under water from the west reach into the lake's centre.
    const westStart = low.find(({ s }) => s > 11500)!.s
    for (let s = westStart; s <= lake.s; s += 5) {
      expect(heightAt(...acrossCentre(s, 0), config)).toBeLessThan(waterLevel)
    }
    expect(heightAt(lake.x, lake.z, config)).toBeCloseTo(waterLevel - river.lake.depth, 6)
    for (let i = 0; i < 24; i++) {
      const theta = (i / 24) * Math.PI * 2
      const x = lake.x + Math.cos(theta) * river.lake.outerRadius
      const z = lake.z + Math.sin(theta) * river.lake.outerRadius
      // Except where the river comes in.
      const inflow = ROUTE.nearest(x, z)
      if (inflow.s < lake.s && Math.abs(inflow.lateral) < reach) continue
      expect(heightAt(x, z, config)).toBeGreaterThan(waterLevel)
    }
  })

  it('is gone past the lake, inside the basin', () => {
    for (let s = lake.s + river.lake.outerRadius; s < ROUTE.length; s += 50) {
      const [x, z] = acrossCentre(s, 0)
      if (nearLake(x, z)) continue
      expect(heightAt(x, z, config)).toBe(heightAt(x, z, dry))
    }
  })
})

describe('noise rivers in the valley corridor', () => {
  // A symmetric profile: 200 m half floor, both walls rising over 180 m.
  const profile = {
    halfWidth: 200,
    offset: 0,
    riseNeg: 180,
    risePos: 180,
    liftNeg: 100,
    liftPos: 100,
  }
  const hitAt = (lateral: number, weight = 1): ValleyHit => ({
    nearest: { s: 0, lateral, floorHeight: 50, valleyWidth: 400 },
    profile,
    weight,
    rival: null,
    rivalProfile: profile,
    rivalWeight: 0,
    rivalPull: 0,
    gullies: [],
  })
  const shoulder = 200 + 180
  const edge = shoulder + valley.fadeWidth

  it('are kept out of the floor and walls, and back in full at the corridor edge', () => {
    expect(noiseRiverKeep(null, valley)).toBe(1)
    expect(noiseRiverKeep(hitAt(0), valley)).toBe(0)
    expect(noiseRiverKeep(hitAt(-shoulder), valley)).toBe(0)
    expect(noiseRiverKeep(hitAt(edge), valley)).toBe(1)
    expect(noiseRiverKeep(hitAt(0, 0.25), valley)).toBeCloseTo(0.75, 6)
  })

  it('takes the stronger of two stretches inside a bend', () => {
    const hit = { ...hitAt(edge), rival: hitAt(0).nearest, rivalWeight: 1 }
    expect(noiseRiverKeep(hit, valley)).toBe(0)
  })

  it('leave the ground alone when not kept', () => {
    expect(carveRivers(60, 0, config, 0)).toBe(60)
    expect(carveRivers(60, 0, config, 1)).toBeCloseTo(waterLevel - config.riverDepth, 6)
  })
})
