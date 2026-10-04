import { describe, expect, it } from 'vitest'
import { heightAt } from './heightfield'
import { LANDMARK_CONFIG } from './landmarks'
import { ROUTE } from './route'
import { LANDMARK_STATIONS } from './routePoints'
import {
  inletSegment,
  seaDistance,
  seaFloorAt,
  seaIslands,
  seaKeepsClear,
  seaOutline,
  seaRadiusAt,
  seaReach,
  townSite,
  withoutSea,
} from './sea'
import { stationFor, stationPosition } from './stations'
import { TERRAIN_CONFIG } from './terrainConfig'

const config = TERRAIN_CONFIG
const sea = config.sea!
const { waterLevel } = config
const bed = waterLevel - sea.bedDepth
const outline = seaOutline(config, 1440)
const islands = seaIslands(config)
const town = stationFor('town')
const deg = (degrees: number): number => (degrees * Math.PI) / 180

/** Outline points on the west shore, the arc that faces the route. */
const westShore = outline.filter((_, i) => {
  const bearing = i / 4
  return Math.abs(bearing - sea.westBearing) <= sea.westHalfArc + sea.westFade
})

/** World (x, z) `distance` m from the sea's centre along a bearing in degrees. */
const along = (bearing: number, distance: number): [number, number] => [
  sea.centerX + Math.sin(deg(bearing)) * distance,
  sea.centerZ - Math.cos(deg(bearing)) * distance,
]

/** True inside any island's reach, where the bed gives way to its shallows. */
const nearIsland = (x: number, z: number, margin = 0) =>
  sea.islands.some(
    (island) =>
      Math.hypot(x - island.x, z - island.z) <
      island.radius * (1 + island.noise) + island.shallows + margin,
  )

describe('inland sea placement', () => {
  it('keeps the west shore 150 to 400 m east of the route', () => {
    let nearest = Infinity
    for (const point of outline) {
      const hit = ROUTE.nearest(point.x, point.z)
      nearest = Math.min(nearest, Math.abs(hit.lateral))
      // Every shore point the route grid reaches is on the pilot's left: east of the reach.
      if (Math.abs(hit.lateral) < 700) expect(hit.lateral).toBeLessThan(0)
    }
    expect(nearest).toBeGreaterThanOrEqual(150)
    expect(nearest).toBeLessThanOrEqual(400)
  })

  it('opens the shore within 400 m of the route from the town down the reach', () => {
    for (let s = town.s - 200; s <= town.s + 800; s += 50) {
      const point = ROUTE.pointAt(s)
      const tangent = ROUTE.tangentAt(s)
      let reach = 0
      while (seaDistance(point.x + tangent.z * reach, point.z - tangent.x * reach, config) < 0) {
        reach += 5
      }
      expect(reach, `s = ${s}`).toBeGreaterThanOrEqual(150)
      expect(reach, `s = ${s}`).toBeLessThanOrEqual(400)
    }
  })

  it('stands the town station at least 1.2 km before the waterfall', () => {
    expect(stationFor('waterfall').s - town.s).toBeGreaterThanOrEqual(1200)
  })

  it('seats the town pad on the west shore, its blend ending at the waterline', () => {
    const site = townSite(config)
    expect(site).toEqual(stationPosition(town))
    const setback = -seaDistance(site.x, site.z, config)
    expect(setback).toBeGreaterThan(sea.town.radius + sea.town.blend - 5)
    expect(setback).toBeLessThan(sea.town.radius + sea.town.blend + 20)
    // Flat and dry across the pad.
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      for (const r of [0, sea.town.radius * 0.5, sea.town.radius]) {
        const h = heightAt(site.x + Math.cos(angle) * r, site.z + Math.sin(angle) * r, config)
        expect(h).toBeCloseTo(sea.town.height, 6)
      }
    }
    expect(sea.town.height).toBeGreaterThan(waterLevel + 4)
  })

  it('brings the river into the west shore south of the town', () => {
    const inlet = inletSegment(config)
    const mouth = ROUTE.nearest(inlet.ax, inlet.az)
    expect(mouth.s).toBeGreaterThan(town.s)
    // The channel runs from the route river to past the shore, under the water all the way.
    expect(seaDistance(inlet.ax, inlet.az, config)).toBeLessThan(0)
    expect(seaDistance(inlet.bx, inlet.bz, config)).toBeGreaterThan(0)
    for (let t = 0; t <= 1; t += 0.02) {
      const x = inlet.ax + (inlet.bx - inlet.ax) * t
      const z = inlet.az + (inlet.bz - inlet.az) * t
      expect(heightAt(x, z, config), `t = ${t}`).toBeLessThan(waterLevel)
    }
  })

  it('stays inside the footprint #222 keeps clear of massifs, with its margin', () => {
    const box = config.massifs.sea
    for (const point of outline) {
      expect(point.x).toBeGreaterThan(box.minX - box.margin)
      expect(point.x).toBeLessThan(box.maxX + box.margin)
      expect(point.z).toBeGreaterThan(box.minZ - box.margin)
      expect(point.z).toBeLessThan(box.maxZ + box.margin)
    }
  })
})

describe('inland sea coast', () => {
  it('shapes the outline from 4 to 6 noise octaves, at least 3 bays and 2 headlands', () => {
    expect(sea.noiseOctaves).toBeGreaterThanOrEqual(4)
    expect(sea.noiseOctaves).toBeLessThanOrEqual(6)
    const ellipse = (bearing: number) => {
      const sx = Math.sin(deg(bearing)) / sea.radiusX
      const cz = Math.cos(deg(bearing)) / sea.radiusZ
      return 1 / Math.hypot(sx, cz)
    }
    const bays = sea.features.filter((f) => f.kind === 'bay')
    const headlands = sea.features.filter((f) => f.kind === 'headland')
    expect(bays.length).toBeGreaterThanOrEqual(3)
    expect(headlands.length).toBeGreaterThanOrEqual(2)
    // Each one shows in the shore: a bay reaches past the ellipse, a headland stops short of it.
    for (const bay of bays) {
      expect(bay.depth, bay.name).toBeGreaterThan(0)
      expect(seaRadiusAt(bay.bearing, config), bay.name).toBeGreaterThan(ellipse(bay.bearing))
    }
    for (const headland of headlands) {
      expect(headland.depth, headland.name).toBeLessThan(0)
      expect(seaRadiusAt(headland.bearing, config), headland.name).toBeLessThan(
        ellipse(headland.bearing),
      )
    }
  })

  it('is irregular: the radius turns over many times round the ring', () => {
    let turns = 0
    let last = seaRadiusAt(359.5, config) - seaRadiusAt(359, config)
    for (let b = 0; b < 360; b += 0.5) {
      const slope = seaRadiusAt(b + 0.5, config) - seaRadiusAt(b, config)
      if (Math.sign(slope) !== Math.sign(last)) turns++
      last = slope
    }
    expect(turns).toBeGreaterThan(30)
  })

  it('lies 6 m under the water beyond the shallows', () => {
    for (let b = 0; b < 360; b += 15) {
      for (const share of [0.3, 0.6]) {
        const [x, z] = along(b, seaRadiusAt(b, config) * share)
        if (nearIsland(x, z)) continue
        expect(heightAt(x, z, config), `bearing ${b}`).toBe(bed)
      }
    }
  })

  it('shelves the shallows over 40 to 120 m from the shore', () => {
    for (let b = 0; b < 360; b += 5) {
      const radius = seaRadiusAt(b, config)
      let width = 0
      while (heightAt(...along(b, radius - width), config) > bed + 1e-6) width += 2
      // Measured radially: the shallows are widest across the shore where it runs at a slant.
      expect(width, `bearing ${b}`).toBeGreaterThanOrEqual(sea.shallowsMin - 4)
      expect(width, `bearing ${b}`).toBeLessThanOrEqual(sea.shallowsMax * 1.6)
    }
  })

  it('rises to a 36 to 42 m beach behind the waterline', () => {
    // North of the break the screen ridge falls to the water as a sea cliff instead; see below.
    const flat = { ...config, sea: { ...sea, screen: { ...sea.screen, height: 0, variation: 0 } } }
    const inlet = inletSegment(config)
    for (let b = 0; b < 360; b += 5) {
      const [x, z] = along(b, seaRadiusAt(b, config) + sea.beachWidth)
      // The town pad and the inlet are shaped on top of the beach.
      const fromTown = Math.hypot(x - townSite(config).x, z - townSite(config).z)
      const fromInlet = Math.hypot(x - inlet.bx, z - inlet.bz)
      if (fromTown < 150 || fromInlet < 600) continue
      const h = heightAt(x, z, flat)
      expect(h, `bearing ${b}`).toBeGreaterThanOrEqual(sea.beachMin - 1)
      expect(h, `bearing ${b}`).toBeLessThanOrEqual(sea.beachMax + 1)
    }
  })

  it('runs from the water onto the land without a step', () => {
    for (let b = 0; b < 360; b += 3) {
      const radius = seaRadiusAt(b, config)
      let last = heightAt(...along(b, radius - 60), config)
      // Across the shallows, the waterline and the beach. Past it the land is the hills' own.
      for (let d = radius - 58; d <= radius + sea.beachWidth; d += 2) {
        const h = heightAt(...along(b, d), config)
        expect(Math.abs(h - last), `bearing ${b} at ${d - radius} m`).toBeLessThan(3)
        last = h
      }
    }
  })

  it('opens the valley east wall at the break, and leaves the route floor and river alone', () => {
    const land = withoutSea(config)
    // The route itself is never under the sea, and its floor is never raised.
    for (let s = 4000; s <= 7200; s += 25) {
      const point = ROUTE.pointAt(s)
      expect(seaDistance(point.x, point.z, config)).toBeLessThan(0)
      expect(heightAt(point.x, point.z, config)).toBeCloseTo(heightAt(point.x, point.z, land), 6)
    }
    // South of the town the wall falls to the shore's beach and meadow.
    for (let s = town.s + 100; s <= town.s + 600; s += 100) {
      const point = ROUTE.pointAt(s)
      const tangent = ROUTE.tangentAt(s)
      const x = point.x + tangent.z * 260
      const z = point.z - tangent.x * 260
      expect(heightAt(x, z, config), `s = ${s}`).toBeLessThan(sea.beachMax + 10)
    }
  })
  it('holds the east wall up north of the break with the screen ridge, ending in sea cliffs', () => {
    const { screen } = sea
    for (let s = screen.from + screen.taper; s <= screen.to - screen.taper; s += 50) {
      const crest = stationPosition({ s, lateral: screen.lateral })
      const d = -seaDistance(crest.x, crest.z, config)
      // Full height on land, or cut back to the cliff where the shore comes close.
      const expected = Math.min(
        screen.height - screen.variation,
        waterLevel + d * screen.cliffSlope - 1,
      )
      expect(heightAt(crest.x, crest.z, config), `s = ${s}`).toBeGreaterThanOrEqual(expected)
    }
  })
})

describe('inland sea islands', () => {
  it('has 2 or 3, one at least 1.2 km across for the resort', () => {
    expect(islands.length).toBeGreaterThanOrEqual(2)
    expect(islands.length).toBeLessThanOrEqual(3)
    const across = islands.map((island) => island.radius * 2)
    expect(Math.max(...across)).toBeGreaterThanOrEqual(1200)
    for (const width of across) expect(width).toBeGreaterThanOrEqual(400)
    // The rest keep to the 400 to 900 m the ticket sets.
    expect(across.filter((width) => width <= 900).length).toBe(islands.length - 1)
  })

  it('returns the centres and radii the terrain builds them from', () => {
    sea.islands.forEach((island, i) => {
      expect(islands[i]).toEqual({
        name: island.name,
        x: island.x,
        z: island.z,
        radius: island.radius,
        maxRadius: island.radius * (1 + island.noise),
      })
    })
  })

  it('keeps each 2 km from the west shore and 1 km from the others, edge to edge', () => {
    for (const island of islands) {
      for (const point of westShore) {
        expect(
          Math.hypot(point.x - island.x, point.z - island.z) - island.maxRadius,
        ).toBeGreaterThan(2000)
      }
      // And wholly in the sea, its shallows on the bed.
      expect(seaDistance(island.x, island.z, config)).toBeGreaterThan(
        island.maxRadius + sea.islands.find((i) => i.name === island.name)!.shallows,
      )
    }
    for (let a = 0; a < islands.length; a++) {
      for (let b = a + 1; b < islands.length; b++) {
        const one = islands[a]!
        const other = islands[b]!
        const gap = Math.hypot(one.x - other.x, one.z - other.z) - one.maxRadius - other.maxRadius
        expect(gap).toBeGreaterThanOrEqual(1000)
      }
    }
  })

  it('stands low, 20 to 45 m over the water, on wide beaches and wider shallows', () => {
    for (const island of sea.islands) {
      let peak = -Infinity
      for (let dx = -island.radius; dx <= island.radius; dx += 20) {
        for (let dz = -island.radius; dz <= island.radius; dz += 20) {
          peak = Math.max(peak, heightAt(island.x + dx, island.z + dz, config))
        }
      }
      expect(peak - waterLevel, island.name).toBeGreaterThanOrEqual(20)
      expect(peak - waterLevel, island.name).toBeLessThanOrEqual(45)
      expect(island.beach, island.name).toBeGreaterThanOrEqual(sea.beachWidth * 0.75)
      expect(island.shallows, island.name).toBeGreaterThan(sea.shallowsMax)
    }
  })
})

describe('inland sea in the terrain', () => {
  it('builds no land inside the outline: the sea floor is the height', () => {
    for (let b = 0; b < 360; b += 20) {
      const [x, z] = along(b, seaRadiusAt(b, config) * 0.8)
      const d = seaReach(x, z, config)!
      expect(d).toBeGreaterThan(0)
      expect(heightAt(x, z, config)).toBe(seaFloorAt(x, z, d, config))
    }
  })

  it('repeats one world period over, with no seam', () => {
    const period = config.worldPeriod
    for (const [x, z] of [
      along(270, 2400),
      along(90, 2000),
      [sea.islands[0]!.x, sea.islands[0]!.z],
    ]) {
      const h = heightAt(x!, z!, config)
      expect(heightAt(x! + period, z!, config)).toBeCloseTo(h, 6)
      expect(heightAt(x!, z! - period, config)).toBeCloseTo(h, 6)
    }
  })

  it('keeps foliage off the water, the beaches and the islands, and off the town pad', () => {
    for (const island of islands) {
      expect(seaKeepsClear(island.x, island.z, config)).toBe(true)
      expect(seaKeepsClear(island.x + config.worldPeriod, island.z, config)).toBe(true)
    }
    for (let b = 0; b < 360; b += 30) {
      expect(seaKeepsClear(...along(b, seaRadiusAt(b, config) + sea.beachWidth - 5), config)).toBe(
        true,
      )
      expect(seaKeepsClear(...along(b, seaRadiusAt(b, config) + sea.beachWidth * 3), config)).toBe(
        false,
      )
    }
    expect(seaKeepsClear(1750, 2000, config)).toBe(false)
    expect(seaKeepsClear(1750, 2000, withoutSea(config))).toBe(false)
  })
})

/**
 * Rays of bearings (heading convention, degrees) from `eye`, 25 m steps out to the haze's full
 * fade: how many land on sea water above every sightline before it.
 */
function seaRaysInSight(
  eye: readonly [number, number, number],
  from: number,
  to: number,
  step: number,
): number {
  let hits = 0
  for (let b = from; b <= to; b += step) {
    const dx = -Math.sin(deg(b))
    const dz = -Math.cos(deg(b))
    let steepest = -Infinity
    for (let t = 25; t < config.hazeFadeEnd; t += 25) {
      const x = eye[0] + dx * t
      const z = eye[2] + dz * t
      const ground = heightAt(x, z, config)
      const angle = (Math.max(ground, waterLevel) - eye[1]) / t
      if (ground < waterLevel && angle >= steepest && seaDistance(x, z, config) > 0) {
        hits++
        break
      }
      steepest = Math.max(steepest, angle)
    }
  }
  return hits
}

const routeEye = (s: number): [number, number, number] => {
  const point = ROUTE.pointAt(s)
  return [point.x, point.floorHeight + LANDMARK_CONFIG.routeEyeHeight, point.z]
}
const headingAt = (s: number): number => {
  const tangent = ROUTE.tangentAt(s)
  return (Math.atan2(-tangent.x, -tangent.z) * 180) / Math.PI
}

describe('inland sea reveal', () => {
  const reveal = town.s - (town.reveal ?? LANDMARK_CONFIG.revealDistance)

  it('is revealed after the station before it, and the town before the waterfall', () => {
    const before = LANDMARK_STATIONS.filter((station) => station.s < town.s).map((st) => st.s)
    expect(reveal).toBeGreaterThan(Math.max(...before))
    const waterfall = stationFor('waterfall')
    expect(waterfall.s - LANDMARK_CONFIG.revealDistance).toBeGreaterThan(town.s)
  })

  it('hides the sea from the route until the reveal', () => {
    // Every bearing that could reach it, from every 100 m of route before the reveal.
    for (let s = 0; s < reveal; s += 100) {
      const eye = routeEye(s)
      expect(seaRaysInSight(eye, -180, 180, 2), `s = ${s}`).toBe(0)
    }
  }, 120_000)

  it('shows it inside the 60° chase view at the station, and from the reveal on', () => {
    for (const s of [reveal + 100, town.s]) {
      const heading = headingAt(s)
      expect(
        seaRaysInSight(routeEye(s), heading - 30, heading + 30, 1),
        `s = ${s}`,
      ).toBeGreaterThan(0)
    }
  })
})
