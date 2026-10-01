import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { ROUTE } from './route'
import { applyRouteValley, smoothMax, valleyAt, valleyWeight, type ValleyHit } from './routeValley'
import { plungePoolCenter } from './stations'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG
const pool = plungePoolCenter(config.plungePool)
const valley = config.valley
const [cut, returnNotch] = config.basin.notches
const cutS = ROUTE.nearest(cut.x, cut.z).s
const returnS = ROUTE.nearest(returnNotch.x, returnNotch.z).s
// Where the valley applies in full, from the end of one join to the start of the other.
const fullStart = cutS + valley.joinLength
const fullEnd = returnS - valley.joinLength

/** World position `lateral` m to the left of the route at arc length `s`. */
function across(s: number, lateral: number): [number, number] {
  const p = ROUTE.pointAt(s)
  const t = ROUTE.tangentAt(s)
  // Left of the direction of travel, matching the sign of `nearest().lateral`.
  return [p.x - t.z * lateral, p.z + t.x * lateral]
}

const hitAt = (lateral: number, weight = 1): ValleyHit => ({
  nearest: { s: 0, lateral, floorHeight: 50, valleyWidth: 400 },
  weight,
  rival: null,
  rivalWeight: 0,
  rivalPull: 0,
})

describe('smoothMax', () => {
  it('is never below the larger value and matches it away from the corner', () => {
    for (const [a, b] of [
      [0, 0],
      [10, 3],
      [3, 10],
      [100, 20],
    ] as const) {
      expect(smoothMax(a, b, 30)).toBeGreaterThanOrEqual(Math.max(a, b))
    }
    expect(smoothMax(100, 20, 30)).toBe(100)
  })
})

describe('valleyWeight', () => {
  it('is zero outside the span, one between the joins, and eases in between', () => {
    expect(valleyWeight(0, 1000, 9000, 150)).toBe(0)
    expect(valleyWeight(1000, 1000, 9000, 150)).toBe(0)
    expect(valleyWeight(5000, 1000, 9000, 150)).toBe(1)
    expect(valleyWeight(9000, 1000, 9000, 150)).toBe(0)
    expect(valleyWeight(1075, 1000, 9000, 150)).toBeCloseTo(0.5)
  })
})

describe('applyRouteValley', () => {
  it('sets the floor inside half the valley width, keeping a little detail', () => {
    expect(applyRouteValley(300, -1, hitAt(0), valley)).toBe(50)
    expect(applyRouteValley(300, 0, hitAt(150), valley)).toBe(50 + valley.floorNoise / 2)
    expect(applyRouteValley(10, 1, hitAt(-199), valley)).toBe(50 + valley.floorNoise)
  })

  it('lifts the wall shoulders at least `wallLift` above the floor, even over low ground', () => {
    const shoulder = 200 + valley.flankWidth * valley.wallShare
    for (const ground of [0, 50, 120, 400]) {
      for (const side of [-1, 1]) {
        const h = applyRouteValley(ground, 0, hitAt(side * shoulder), valley)
        expect(h).toBeGreaterThanOrEqual(50 + valley.wallLift)
        expect(h).toBeGreaterThanOrEqual(ground)
      }
    }
  })

  it('hands back the terrain untouched at the edge of the flank and with no weight', () => {
    expect(applyRouteValley(123, 0.5, hitAt(200 + valley.flankWidth), valley)).toBe(123)
    expect(applyRouteValley(123, 0.5, hitAt(0, 0), valley)).toBe(123)
  })

  it('is C1 across the floor edge, the shoulder and the flank edge', () => {
    // Slope from either side of each seam agrees, for flat and sloping terrain under the flank.
    const h = 0.01
    const seams = [200, 200 + valley.flankWidth * valley.wallShare, 200 + valley.flankWidth]
    for (const ground of [(d: number) => 20 + 0 * d, (d: number) => 300 - d * 0.3]) {
      const at = (d: number) => applyRouteValley(ground(d), 0, hitAt(d), valley)
      for (const seam of seams) {
        const left = (at(seam) - at(seam - h)) / h
        const right = (at(seam + h) - at(seam)) / h
        expect(Math.abs(left - right)).toBeLessThan(0.01)
        expect(Math.abs(at(seam + h) - at(seam - h))).toBeLessThan(0.05)
      }
    }
  })
})

describe('route valley in the terrain', () => {
  it('leaves the world alone far from the route and inside the basin', () => {
    expect(valleyAt(-20000, 4000, config)).toBeNull()
    expect(valleyAt(config.basin.centerX, config.basin.centerZ, config)).toBeNull()
    expect(valleyAt(cut.x, cut.z, config)).toBeNull()
    expect(valleyAt(returnNotch.x, returnNotch.z, config)).toBeNull()
  })

  it('keeps the floor clear along the whole route between the joins', () => {
    for (let s = fullStart; s <= fullEnd; s += 25) {
      const { valleyWidth } = ROUTE.pointAt(s)
      for (const share of [-0.9, -0.5, 0, 0.5, 0.9]) {
        const [x, z] = across(s, (share * valleyWidth) / 2)
        // Judge each point by the stretch it belongs to. Inside the tight west bend the two
        // stretches' floors merge, so leave those to the bend test.
        const hit = valleyAt(x, z, config)!
        if (hit.rivalPull > 0) continue
        // The waterfall's plunge pool (#173) is dug into the floor on purpose.
        if (Math.hypot(x - pool.x, z - pool.z) < config.plungePool.outerRadius) continue
        const { floorHeight } = hit.nearest
        const h = heightAt(x, z, config)
        expect(h).toBeLessThanOrEqual(floorHeight + valley.floorNoise + 0.5)
        expect(h).toBeGreaterThanOrEqual(floorHeight - 0.5)
        expect(h).toBeGreaterThan(config.waterLevel)
      }
    }
  })

  it('raises flanks above the floor by the designed margin on both sides', () => {
    for (let s = fullStart; s <= fullEnd; s += 25) {
      const { floorHeight, valleyWidth } = ROUTE.pointAt(s)
      const shoulder = valleyWidth / 2 + valley.flankWidth * valley.wallShare
      for (const side of [-1, 1]) {
        const [x, z] = across(s, side * shoulder)
        // A tight bend puts the inside shoulder nearer another stretch of the route. Judge it
        // against the stretch it actually belongs to.
        const nearest = ROUTE.nearest(x, z)
        if (Math.abs(nearest.s - s) > 50) continue
        expect(heightAt(x, z, config)).toBeGreaterThanOrEqual(floorHeight + valley.wallLift - 0.5)
      }
    }
  })

  it.each([
    ['cut', cutS, cutS + valley.joinLength + 100],
    ['return notch', returnS - valley.joinLength - 100, returnS],
  ] as const)('joins the %s smoothly, along the route and across it', (_name, from, to) => {
    // Along the centre line: no steps and no humps between the notch floor and the valley floor.
    let previous = heightAt(...across(from, 0), config)
    let previousSlope: number | null = null
    for (let s = from + 1; s <= to; s += 1) {
      const h = heightAt(...across(s, 0), config)
      const slope = h - previous
      // Under 14°: the floor detail's own bumps, no cliff or step at the join.
      expect(Math.abs(slope)).toBeLessThan(0.25)
      if (previousSlope !== null) expect(Math.abs(slope - previousSlope)).toBeLessThan(0.02)
      const { floorHeight } = ROUTE.pointAt(s)
      expect(Math.abs(h - floorHeight)).toBeLessThan(valley.floorNoise + 2)
      previous = h
      previousSlope = slope
    }
    // Across it, at points through the join: floor and walls stay smooth. A step or crease shows
    // as a jump in the slope. Past the shoulders the terrain's own ridged creases come back.
    for (let s = from; s <= to; s += 50) {
      const shoulder = ROUTE.pointAt(s).valleyWidth / 2 + valley.flankWidth * valley.wallShare
      let last = heightAt(...across(s, -shoulder), config)
      let lastSlope: number | null = null
      for (let lateral = -shoulder + 2; lateral <= shoulder; lateral += 2) {
        const h = heightAt(...across(s, lateral), config)
        const slope = (h - last) / 2
        if (lastSlope !== null) expect(Math.abs(slope - lastSlope)).toBeLessThan(0.25)
        last = h
        lastSlope = slope
      }
    }
  })

  it('has no step inside the tight west bend, where the nearest stretch of route changes', () => {
    // Around the sharpest bend two stretches are about equally near, out across the inside wall.
    // Walk cross-sections finely: a step where the nearest stretch flips would show as a jump.
    for (let s = 11500; s <= 12500; s += 20) {
      const reach = ROUTE.pointAt(s).valleyWidth / 2 + valley.flankWidth
      for (const side of [-1, 1]) {
        let last = heightAt(...across(s, 0), config)
        for (let lateral = 0.5; lateral <= reach; lateral += 0.5) {
          const h = heightAt(...across(s, side * lateral), config)
          expect(Math.abs(h - last)).toBeLessThan(2.5)
          last = h
        }
      }
    }
  })

  it('gives the worker the same heights as the main thread', () => {
    // The worker gets a structured clone of the config, so it builds its own span and route.
    const clone = structuredClone(config)
    for (let i = 0; i < 400; i++) {
      const [x, z] = across((i / 400) * ROUTE.length, Math.sin(i * 7.3) * 600)
      expect(heightAt(x, z, clone)).toBe(heightAt(x, z, config))
    }
  })
})
