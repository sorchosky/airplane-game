import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { GRID_REACH, ROUTE } from './route'
import { LANDMARK_STATIONS } from './routePoints'
import { withoutRouteRiver } from './routeRiver'
import {
  applyRouteValley,
  cutGullies,
  smoothMax,
  smoothMin,
  valleyAt,
  valleyCalm,
  valleyGullies,
  valleyHalfWidth,
  valleyProfileAt,
  valleyReach,
  valleyWeight,
  type Gully,
  type ValleyHit,
  type ValleyProfile,
} from './routeValley'
import { plungePoolCenter } from './stations'
import { TERRAIN_CONFIG } from './terrainConfig'

// The valley on its own: the route river (#174) cuts its floor on purpose, and has its own tests.
const config = withoutRouteRiver(TERRAIN_CONFIG)
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

/** World position `lateral` m off the floor's carved centre at `s`. */
function acrossCentre(s: number, lateral: number): [number, number] {
  return across(s, valleyProfileAt(s, config).offset + lateral)
}

// A symmetric profile: 200 m half floor, both walls rising 100 m over 180 m.
const even: ValleyProfile = {
  halfWidth: 200,
  offset: 0,
  riseNeg: 180,
  risePos: 180,
  liftNeg: 100,
  liftPos: 100,
}

const hitAt = (lateral: number, weight = 1, profile = even): ValleyHit => ({
  nearest: { s: 0, lateral, floorHeight: 50, valleyWidth: 400 },
  profile,
  weight,
  rival: null,
  rivalProfile: profile,
  rivalWeight: 0,
  rivalPull: 0,
  gullies: [],
})

/** m of a gully's sweep along the route, mouth to head. */
const sweepOf = (g: { width: number; skew: number; length: number }) =>
  g.width / 2 + Math.abs(g.skew) * g.length
const gullies = valleyGullies(config)
const inGully = (s: number) => gullies.some((g) => Math.abs(s - g.s) < sweepOf(g) + 20)

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

describe('smoothMin', () => {
  it('is never above the smaller value and matches it away from the corner', () => {
    expect(smoothMin(10, 3, 5)).toBeLessThanOrEqual(3)
    expect(smoothMin(3, 3, 5)).toBeLessThanOrEqual(3)
    expect(smoothMin(100, 20, 30)).toBe(20)
  })
})

describe('valleyHalfWidth', () => {
  it('stays inside the 150 to 300 m half width whatever the noise', () => {
    for (let half = 100; half <= 400; half += 10) {
      for (let noise = -1; noise <= 1; noise += 0.05) {
        for (const calm of [0, 0.5, 1]) {
          const w = valleyHalfWidth(half, noise, calm, valley)
          expect(w).toBeGreaterThanOrEqual(valley.minHalfWidth)
          expect(w).toBeLessThanOrEqual(valley.maxHalfWidth)
        }
      }
    }
  })

  it('breathes by the configured share, and not at all when calm', () => {
    expect(valleyHalfWidth(200, 1, 0, valley)).toBeCloseTo(200 * (1 + valley.widthVariation), 6)
    expect(valleyHalfWidth(240, -1, 0, valley)).toBeCloseTo(240 * (1 - valley.widthVariation), 6)
    expect(valleyHalfWidth(200, 1, 1, valley)).toBe(200)
  })
})

describe('valleyCalm', () => {
  const span = { start: 1000, end: 12000 }
  it('holds within the station clearance and through the joins, and lets go past them', () => {
    expect(valleyCalm(5000, [5000], span, 14000, valley)).toBe(1)
    expect(valleyCalm(5000 + valley.stationClearance, [5000], span, 14000, valley)).toBe(1)
    expect(valleyCalm(1000 + valley.joinLength, [], span, 14000, valley)).toBe(1)
    const free = 5000 + valley.stationClearance + valley.calmLength
    expect(valleyCalm(free, [5000], span, 14000, valley)).toBe(0)
    // Across the loop's wrap a station near the end still counts.
    expect(valleyCalm(100, [13900], { start: -5000, end: 9000 }, 14000, valley)).toBe(1)
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

  // One side a cliff, the other a grass slope, the floor 30 m off the route line.
  const lopsided: ValleyProfile = {
    halfWidth: 180,
    offset: 30,
    riseNeg: valley.cliffRise,
    risePos: valley.grassRise,
    liftNeg: valley.cliffLift,
    liftPos: valley.grassLift,
  }

  it('lifts each wall shoulder its own lift above the floor, even over low ground', () => {
    for (const profile of [even, lopsided]) {
      for (const ground of [0, 50, 120, 400]) {
        for (const side of [-1, 1]) {
          const rise = side < 0 ? profile.riseNeg : profile.risePos
          const lift = side < 0 ? profile.liftNeg : profile.liftPos
          const lateral = profile.offset + side * (profile.halfWidth + rise)
          const h = applyRouteValley(ground, 0, hitAt(lateral, 1, profile), valley)
          expect(h).toBeGreaterThanOrEqual(50 + lift)
          expect(h).toBeGreaterThanOrEqual(ground)
        }
      }
    }
  })

  it('puts the floor round its carved centre, not the route line', () => {
    expect(applyRouteValley(300, -1, hitAt(30 + 179, 1, lopsided), valley)).toBe(50)
    expect(applyRouteValley(300, -1, hitAt(30 - 179, 1, lopsided), valley)).toBe(50)
    expect(applyRouteValley(300, -1, hitAt(30 + 200, 1, lopsided), valley)).toBeGreaterThan(50)
  })

  it('makes a cliff of the steep side and a grass slope of the gentle one', () => {
    // Steepest pitch of each wall over flat ground well below the shoulder.
    const steepest = (side: number, rise: number) => {
      let most = 0
      for (let d = 180; d < 180 + rise; d += 1) {
        const at = (x: number) => applyRouteValley(0, 0, hitAt(30 + side * x, 1, lopsided), valley)
        most = Math.max(most, Math.abs(at(d + 1) - at(d)))
      }
      return (Math.atan(most) * 180) / Math.PI
    }
    expect(steepest(-1, valley.cliffRise)).toBeGreaterThan(45)
    const grass = steepest(1, valley.grassRise)
    expect(grass).toBeGreaterThan(15)
    expect(grass).toBeLessThan(25)
  })

  it('hands back the terrain untouched past the fade and with no weight', () => {
    expect(applyRouteValley(123, 0.5, hitAt(200 + 180 + valley.fadeWidth), valley)).toBe(123)
    expect(applyRouteValley(123, 0.5, hitAt(0, 0), valley)).toBe(123)
  })

  it('is C1 across the floor edge, the shoulder and the fade edge, on both sides', () => {
    // Slope from either side of each seam agrees, for flat and sloping terrain under the flank.
    const h = 0.01
    for (const profile of [even, lopsided]) {
      for (const side of [-1, 1]) {
        const rise = side < 0 ? profile.riseNeg : profile.risePos
        const seams = [0, profile.halfWidth, profile.halfWidth + rise]
        seams.push(seams[2]! + valley.fadeWidth)
        for (const ground of [(d: number) => 20 + 0 * d, (d: number) => 300 - d * 0.3]) {
          const at = (d: number) =>
            applyRouteValley(ground(d), 0, hitAt(profile.offset + side * d, 1, profile), valley)
          for (const seam of seams) {
            const left = (at(seam) - at(seam - h)) / h
            const right = (at(seam + h) - at(seam)) / h
            expect(Math.abs(left - right)).toBeLessThan(0.01)
            expect(Math.abs(at(seam + h) - at(seam - h))).toBeLessThan(0.05)
          }
        }
      }
    }
  })
})

describe('cutGullies', () => {
  const profile = { ...even, offset: 20 }
  const gully: Gully = { s: 1000, side: 1, width: 90, length: 400, skew: 0.3 }
  // Smooth ground: a wall rising 150 m off the floor's edge, then a gentle slope.
  const ground = (lateral: number) => {
    const t = Math.min(1, Math.max(0, (lateral - 200) / 200))
    return 50 + 150 * t * t * (3 - 2 * t) + lateral * 0.01
  }
  const cut = (s: number, lateral: number) =>
    cutGullies(
      ground(lateral - profile.offset),
      { s, lateral, floorHeight: 50, valleyWidth: 400 },
      profile,
      1,
      [gully],
      valley,
    )

  it('lowers the wall inside the gully and leaves the floor and the far wall alone', () => {
    const out = 150
    const lateral = profile.offset + 200 + out
    expect(cut(gully.s + gully.skew * out, lateral)).toBeLessThan(ground(200 + out) - 40)
    expect(cut(gully.s + gully.skew * out + 200, lateral)).toBe(ground(200 + out))
    for (const lateral of [profile.offset, profile.offset + 150, profile.offset - 300]) {
      expect(cut(gully.s, lateral)).toBe(ground(lateral - profile.offset))
    }
  })

  it('is C1 across the mouth and along the gully: the slope never jumps', () => {
    // A crease shows as a slope jump that doesn't shrink with the step. A smooth surface's jumps
    // halve as the step does.
    const worst = (step: number) => {
      let most = 0
      for (const out of [10, 120, 250, 380]) {
        let last = cut(gully.s + gully.skew * out - 100, profile.offset + 200 + out)
        let lastSlope: number | null = null
        for (let d = -100 + step; d <= 100; d += step) {
          const h = cut(gully.s + gully.skew * out + d, profile.offset + 200 + out)
          const slope = (h - last) / step
          if (lastSlope !== null) most = Math.max(most, Math.abs(slope - lastSlope))
          last = h
          lastSlope = slope
        }
      }
      for (const d of [0, 20, 40]) {
        let last = cut(gully.s + d, profile.offset - 50)
        let lastSlope: number | null = null
        for (let lateral = -50 + step; lateral <= 650; lateral += step) {
          const h = cut(
            gully.s + d + gully.skew * Math.max(0, lateral - 200),
            profile.offset + lateral,
          )
          const slope = (h - last) / step
          if (lastSlope !== null) most = Math.max(most, Math.abs(slope - lastSlope))
          last = h
          lastSlope = slope
        }
      }
      return most
    }
    const coarse = worst(0.2)
    const fine = worst(0.1)
    expect(fine).toBeLessThan(coarse * 0.6)
    expect(fine).toBeLessThan(0.1)
  })
})

describe('route valley in the terrain', () => {
  it('leaves the world alone far from the route and inside the basin', () => {
    // Half a period from the basin on both axes: the furthest place in the wrapped world.
    const far = config.worldPeriod / 2
    expect(valleyAt(config.basin.centerX + far, config.basin.centerZ + far, config)).toBeNull()
    expect(valleyAt(config.basin.centerX, config.basin.centerZ, config)).toBeNull()
    expect(valleyAt(cut.x, cut.z, config)).toBeNull()
    expect(valleyAt(returnNotch.x, returnNotch.z, config)).toBeNull()
  })

  it('keeps the floor clear along the whole route between the joins', () => {
    for (let s = fullStart; s <= fullEnd; s += 25) {
      const { halfWidth } = valleyProfileAt(s, config)
      for (const share of [-0.9, -0.5, 0, 0.5, 0.9]) {
        const [x, z] = acrossCentre(s, share * halfWidth)
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

  it('raises each wall above the floor by its own lift', () => {
    for (let s = fullStart; s <= fullEnd; s += 25) {
      if (inGully(s)) continue
      const profile = valleyProfileAt(s, config)
      for (const side of [-1, 1]) {
        const rise = side < 0 ? profile.riseNeg : profile.risePos
        const [x, z] = acrossCentre(s, side * (profile.halfWidth + rise))
        // A tight bend puts the inside shoulder nearer another stretch of the route. Judge it
        // against the stretch it actually belongs to, and by the profile where it is nearest.
        const nearest = ROUTE.nearest(x, z)
        if (Math.abs(nearest.s - s) > 50) continue
        const own = valleyProfileAt(nearest.s, config)
        const lift = side < 0 ? own.liftNeg : own.liftPos
        expect(heightAt(x, z, config)).toBeGreaterThanOrEqual(nearest.floorHeight + lift - 0.5)
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
      const profile = valleyProfileAt(s, config)
      const shoulder = profile.halfWidth + Math.min(profile.riseNeg, profile.risePos)
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
      const reach = valleyReach(config)
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

  it('keeps the route line at least 100 m inside the floor everywhere', () => {
    for (let s = 0; s < ROUTE.length; s += 5) {
      const p = valleyProfileAt(s, config)
      expect(p.halfWidth).toBeGreaterThanOrEqual(valley.minHalfWidth)
      expect(p.halfWidth).toBeLessThanOrEqual(valley.maxHalfWidth)
      expect(Math.abs(p.offset)).toBeLessThanOrEqual(valley.meander)
      expect(p.halfWidth - Math.abs(p.offset)).toBeGreaterThanOrEqual(100)
    }
  })

  it('breathes in width and meanders between the stations', () => {
    let narrowest = Infinity
    let widest = 0
    let furthest = 0
    for (let s = fullStart; s <= fullEnd; s += 10) {
      const p = valleyProfileAt(s, config)
      const ratio = p.halfWidth / (ROUTE.pointAt(s).valleyWidth / 2)
      narrowest = Math.min(narrowest, ratio)
      widest = Math.max(widest, ratio)
      furthest = Math.max(furthest, Math.abs(p.offset))
    }
    expect(narrowest).toBeLessThan(0.85)
    expect(widest).toBeGreaterThan(1.15)
    expect(furthest).toBeGreaterThan(valley.meander * 0.75)
  })

  it('holds the authored width and line round every landmark station', () => {
    for (const station of LANDMARK_STATIONS) {
      for (let d = -valley.stationClearance; d <= valley.stationClearance; d += 25) {
        const s = station.s + d
        const p = valleyProfileAt(s, config)
        // Within the table's interpolation: millimetres.
        expect(p.offset).toBeCloseTo(0, 2)
        const authored = valleyHalfWidth(ROUTE.pointAt(s).valleyWidth / 2, 0, 1, valley)
        expect(p.halfWidth).toBeCloseTo(authored, 2)
      }
    }
  })

  it('swaps the cliff from one side to the other every 1 to 3 km', () => {
    // Away from the basin, whose ridge keeps one wall as #171 and #172 built it.
    const swaps: number[] = []
    let last = 0
    for (let s = 2000; s <= 9000; s += 5) {
      const p = valleyProfileAt(s, config)
      const cliff = Math.sign(p.liftPos / p.risePos - p.liftNeg / p.riseNeg)
      if (last !== 0 && cliff !== last) swaps.push(s)
      last = cliff
    }
    expect(swaps.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < swaps.length; i++) {
      expect(swaps[i]! - swaps[i - 1]!).toBeGreaterThanOrEqual(1000)
      expect(swaps[i]! - swaps[i - 1]!).toBeLessThanOrEqual(3000)
    }
  })

  it('breaks the shoulders into a skyline, not a level contour', () => {
    // Over any 1 km of route each shoulder's lift moves by tens of metres. Away from the basin,
    // whose ridge holds one wall level.
    for (let s = 2000; s + 1000 <= 9000; s += 1000) {
      for (const key of ['liftNeg', 'liftPos'] as const) {
        let low = Infinity
        let high = -Infinity
        for (let d = 0; d <= 1000; d += 10) {
          const lift = valleyProfileAt(s + d, config)[key]
          low = Math.min(low, lift)
          high = Math.max(high, lift)
        }
        expect(high - low, `${key} from ${s}`).toBeGreaterThan(15)
      }
    }
  })

  it('stays inside the route grid, so a miss stays one lookup', () => {
    expect(valleyReach(config)).toBeLessThanOrEqual(GRID_REACH)
  })

  it('opens at least four side gullies, sized and clear of the stations', () => {
    expect(gullies.length).toBeGreaterThanOrEqual(4)
    for (const g of gullies) {
      expect(g.width).toBeGreaterThanOrEqual(60)
      expect(g.width).toBeLessThanOrEqual(120)
      expect(g.length).toBeGreaterThanOrEqual(300)
      expect(g.length).toBeLessThanOrEqual(600)
      for (const station of LANDMARK_STATIONS) {
        expect(Math.abs(g.s - station.s) - sweepOf(g)).toBeGreaterThanOrEqual(
          valley.stationClearance,
        )
      }
    }
  })

  it('cuts each gully down through its wall', () => {
    for (const g of gullies) {
      const p = valleyProfileAt(g.s, config)
      const rise = g.side < 0 ? p.riseNeg : p.risePos
      // Halfway up the wall: the gully bed against the same wall a gully-width either side.
      const out = Math.min(rise * 0.75, g.length * 0.5)
      const lateral = g.side * (p.halfWidth + out)
      const bed = heightAt(...acrossCentre(g.s + g.skew * out, lateral), config)
      const floor = ROUTE.pointAt(g.s).floorHeight
      expect(bed).toBeLessThan(floor + valley.floorNoise + valley.gullies.softness + 0.5 * out)
      const beside = Math.max(
        heightAt(...acrossCentre(g.s + g.skew * out - g.width * 1.5, lateral), config),
        heightAt(...acrossCentre(g.s + g.skew * out + g.width * 1.5, lateral), config),
      )
      expect(beside - bed).toBeGreaterThan(20)
    }
  })

  it('never steps: the valley over smooth ground changes only as fast as its walls', () => {
    // The valley alone, over flat ground below and above its shoulders, so the natural terrain's
    // own ridged creases don't count. Walked finely across, any seam (a jump in the nearest `s`,
    // a gully edge, a side switch) would show as a change that a cliff's slope can't explain.
    const reach = valleyReach(config)
    for (let s = fullStart; s <= fullEnd; s += 200) {
      // The tight west bend (~127 m radius) has its own test: past its centre of curvature the
      // nearest point really does jump from one stretch to the other, and the floors either side
      // differ by up to 2 m, as they did before #221.
      if (s > 11400 && s < 12600) continue
      for (const ground of [20, 400]) {
        const at = (lateral: number) => {
          const hit = valleyAt(...across(s, lateral), config)
          return hit ? applyRouteValley(ground, 0, hit, valley) : ground
        }
        let last = at(-reach)
        for (let lateral = -reach + 0.5; lateral <= reach; lateral += 0.5) {
          const h = at(lateral)
          const change = Math.abs(h - last)
          last = h
          if (change < 0.25) continue
          // A seam keeps its whole height in one short sub-step; a slope spreads it evenly.
          let most = 0
          for (let k = 0; k < 10; k++) {
            const a = lateral - 0.5 + k * 0.05
            most = Math.max(most, Math.abs(at(a + 0.05) - at(a)))
          }
          expect(most, `s ${s} lateral ${lateral}`).toBeLessThan(change * 0.3)
        }
      }
    }
    // Some 100k valley lookups: a few seconds locally, more on a shared CI runner.
  }, 30_000)

  it('gives the worker the same heights as the main thread', () => {
    // The worker gets a structured clone of the config, so it builds its own span and route.
    const clone = structuredClone(config)
    for (let i = 0; i < 400; i++) {
      const [x, z] = across((i / 400) * ROUTE.length, Math.sin(i * 7.3) * 700)
      expect(heightAt(x, z, clone)).toBe(heightAt(x, z, config))
    }
  })
})
