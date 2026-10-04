import { mulberry32 } from './seeded'

// The fishing town's plan (#224), pure: where the houses, lanes, pier and lighthouse stand on the
// sea's west shore. The model (`models/town.ts`) builds geometry from this and the foliage and
// tests read the same plan.
//
// Everything is in the town's frame: origin at the pad's centre on the ground, x east (toward the
// sea), z south, y up, metres. The frame is the world's, shifted, so the shore runs roughly along
// z and the water lies to +x. `ground` is the terrain relative to the origin.

/** The town's own ground, relative to its origin: `heightAt(origin + (x, z)) - origin height`. */
export type TownGround = (x: number, z: number) => number

export type HouseVariant = 'cottage' | 'twoStorey' | 'boathouse'
export type RoofTone = 'terracotta' | 'slate'

export interface TownHouse {
  variant: HouseVariant
  /** m, centre of the footprint */
  x: number
  z: number
  /** radians, turn about Y. Local +z (the front) faces the sea, off the lane by up to ±8°; the boathouse's water door is on local +x. */
  yaw: number
  /** m, along the ridge (local x) and across it (local z) */
  length: number
  width: number
  wallHeight: number
  /** radians, roof pitch, 40 to 50° */
  pitch: number
  roof: RoofTone
  chimney: boolean
  seed: number
}

export interface TownPier {
  /** m, the pier's landward end and its seaward end, along x at `z` */
  x0: number
  x1: number
  z: number
  width: number
  /** m, top of the deck, over the origin */
  deckHeight: number
}

export interface TownFinger {
  /** m, a finger runs along z from `z0` to `z1` at `x`, off the main pier */
  x: number
  z0: number
  z1: number
  width: number
}

export interface TownCrate {
  x: number
  z: number
  /** m, height of the surface it stands on */
  y: number
  size: number
  yaw: number
}

export interface TownBarrel {
  x: number
  z: number
  y: number
}

export interface TownRack {
  x: number
  z: number
  /** radians, turn about Y; the net spans local x */
  yaw: number
  length: number
}

export interface TownCircle {
  x: number
  z: number
  radius: number
}

/** A dirt road: a centre line of (x, z) points and its width, m. */
export interface TownRoad {
  points: readonly (readonly [number, number])[]
  width: number
}

export interface TownLayout {
  /** Dirt roads: two lanes along the shore, the pier road between them, and a spur to every door. */
  roads: readonly TownRoad[]
  houses: readonly TownHouse[]
  pier: TownPier
  fingers: readonly TownFinger[]
  crates: readonly TownCrate[]
  barrels: readonly TownBarrel[]
  rack: TownRack
  /** `height` is over the lighthouse's own ground. */
  lighthouse: { x: number; z: number; height: number; radius: number }
  /** m, the waterline's x at a z, on the shore the lanes follow */
  shoreAt: (z: number) => number
  /** Circles covering everything above, for foliage to keep clear of. */
  footprints: readonly TownCircle[]
}

export interface TownPlanConfig {
  seed: number
  /** m, the water plane's height over the origin (negative: the pad stands above it) */
  waterHeight: number
  /** m, how far the main pier runs out from the shore */
  pierLength: number
  /** m, how far inland the shore lane and the back lane run from the waterline */
  laneOffsets: readonly [number, number]
  /** m, the lighthouse's height over its own ground */
  lighthouseHeight: number
}

export const TOWN_PLAN: TownPlanConfig = {
  seed: 224,
  waterHeight: -5,
  pierLength: 75,
  laneOffsets: [34, 76],
  lighthouseHeight: 44,
}

const DEG = Math.PI / 180

/** m, where the ridge stands over the house's own ground level. */
export function ridgeHeight(house: Pick<TownHouse, 'wallHeight' | 'width' | 'pitch'>): number {
  // The eaves reach 0.9 m past the wall; the ridge is over the wall's mid-line.
  return house.wallHeight + (house.width / 2) * Math.tan(house.pitch)
}

/** The shore's waterline x at every `step` m of z, scanned east from the pad, then smoothed. */
function shoreProfile(
  ground: TownGround,
  waterHeight: number,
  z0: number,
  z1: number,
  step: number,
): { zs: number[]; xs: number[] } {
  const zs: number[] = []
  const raw: number[] = []
  for (let z = z0; z <= z1; z += step) {
    let x = 0
    // The waterline is where the shelving ground goes a metre under the beach's lip.
    while (x < 400 && ground(x, z) > waterHeight + 0.5) x += 2
    zs.push(z)
    raw.push(x)
  }
  // A moving average over ±3 samples: lanes follow the contour without chasing every ripple.
  const xs = raw.map((_, i) => {
    let sum = 0
    let count = 0
    for (let k = -3; k <= 3; k++) {
      const v = raw[i + k]
      if (v === undefined) continue
      sum += v
      count++
    }
    return sum / count
  })
  return { zs, xs }
}

function interpolate(zs: readonly number[], xs: readonly number[], z: number): number {
  const first = zs[0] ?? 0
  const step = (zs[1] ?? first + 1) - first
  const u = Math.min(zs.length - 1.001, Math.max(0, (z - first) / step))
  const i = Math.floor(u)
  const a = xs[i] ?? 0
  const b = xs[i + 1] ?? a
  return a + (b - a) * (u - i)
}

/** Where a house's door sits on its front, as a share of its length from the centre. */
export const DOOR_OFFSET = -0.14

/**
 * The town-frame point a house's door opens onto, `reach` m out from the wall: a step out for a
 * house, 8 m up the beach for a boathouse, whose landward wall stands at the waterline.
 */
export function doorPoint(
  house: TownHouse,
  reach = house.variant === 'boathouse' ? 8 : 0.6,
): [number, number] {
  const boathouse = house.variant === 'boathouse'
  // Local frame: the boathouse's landward door is its -x gable; the others front onto +z.
  const lx = boathouse ? -house.length / 2 - reach : DOOR_OFFSET * house.length
  const lz = boathouse ? 0 : house.width / 2 + reach
  const cos = Math.cos(house.yaw)
  const sin = Math.sin(house.yaw)
  return [house.x + lx * cos + lz * sin, house.z - lx * sin + lz * cos]
}

/** The nearest point of a polyline to (x, z). */
function nearestOn(
  points: readonly (readonly [number, number])[],
  x: number,
  z: number,
): [number, number] {
  let best: [number, number] = [points[0]![0], points[0]![1]]
  let bestD = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i]!
    const [bx, bz] = points[i + 1]!
    const dx = bx - ax
    const dz = bz - az
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    const px = ax + dx * t
    const pz = az + dz * t
    const d = (x - px) ** 2 + (z - pz) ** 2
    if (d < bestD) {
      bestD = d
      best = [px, pz]
    }
  }
  return best
}

export function planTown(ground: TownGround, config: TownPlanConfig = TOWN_PLAN): TownLayout {
  const random = mulberry32(config.seed)
  const between = (a: number, b: number) => a + (b - a) * random()
  const { zs, xs } = shoreProfile(ground, config.waterHeight, -200, 240, 10)
  const shoreAt = (z: number) => interpolate(zs, xs, z)

  // The lighthouse stands on the shore's point nearest the route (the shore's least x, west), at
  // the south end of the town where the shore bends in toward the valley.
  let lightZ = 0
  let lightX = Infinity
  for (let z = 120; z <= 180; z += 10) {
    if (shoreAt(z) < lightX) {
      lightX = shoreAt(z)
      lightZ = z
    }
  }
  const lighthouse = {
    x: lightX - 12,
    z: lightZ,
    height: config.lighthouseHeight,
    radius: 6.5,
  }

  const pierZ = 8
  const pierRoot = shoreAt(pierZ)
  const pier: TownPier = {
    x0: pierRoot - 4,
    x1: pierRoot + config.pierLength,
    z: pierZ,
    width: 4.2,
    deckHeight: config.waterHeight + 1.9,
  }
  const fingers: TownFinger[] = [
    { x: pierRoot + 34, z0: pierZ + 2, z1: pierZ + 24, width: 2.6 },
    { x: pierRoot + 56, z0: pierZ - 17, z1: pierZ - 2, width: 2.6 },
  ]

  const houses: TownHouse[] = []
  const slope = (z: number) => (shoreAt(z + 5) - shoreAt(z - 5)) / 10
  const addHouse = (variant: HouseVariant, z: number, offset: number, i: number) => {
    // The lane runs along the shore: a house stands `offset` m inland on the sea's normal, and
    // faces along the normal where it stands.
    const normalAt = (at: number) => {
      const inv = 1 / Math.hypot(1, slope(at))
      return { nx: inv, nz: -slope(at) * inv }
    }
    const first = normalAt(z)
    const x = shoreAt(z) - offset * first.nx
    const zc = z - offset * first.nz
    const { nx, nz } = normalAt(zc)
    const off = between(-8, 8) * DEG
    const facing = variant === 'boathouse' ? Math.atan2(-nz, nx) : Math.atan2(nx, nz)
    const length = {
      cottage: between(8, 10),
      twoStorey: between(8.5, 10),
      boathouse: between(11, 13),
    }[variant]
    const width = {
      cottage: between(5.6, 6.6),
      twoStorey: between(6.2, 7.2),
      boathouse: between(6.6, 7.6),
    }[variant]
    const wallHeight = {
      cottage: between(2.8, 3.2),
      twoStorey: between(5.6, 6.2),
      boathouse: between(3.4, 3.9),
    }[variant]
    houses.push({
      variant,
      x,
      z: zc,
      yaw: facing + off,
      length,
      width,
      wallHeight,
      pitch: between(40, 50) * DEG,
      roof: random() < 0.5 ? 'terracotta' : 'slate',
      chimney: i % 2 === 0,
      seed: 100 + i,
    })
  }

  let i = 0
  // The shore lane: houses facing the water, a little under 50 m apart, alternating one and two
  // storeys.
  for (let z = -92; z <= 110; z += between(42, 52)) {
    addHouse(i % 3 === 1 ? 'twoStorey' : 'cottage', z + between(-5, 5), config.laneOffsets[0], i++)
  }
  // The back lane, further inland, between the shore houses.
  for (let z = -70; z <= 100; z += between(46, 56)) {
    addHouse(i % 2 === 0 ? 'twoStorey' : 'cottage', z + between(-5, 5), config.laneOffsets[1], i++)
  }
  // Two boathouses astride the waterline, their water doors out over it, either side of the pier.
  addHouse('boathouse', -52, -6, i++)
  addHouse('boathouse', 66, -6, i++)

  // Nothing stands in the lighthouse's own ground, or on the pier's landward road.
  const kept = houses.filter((house) => {
    if (Math.hypot(house.x - lighthouse.x, house.z - lighthouse.z) < 28) return false
    return house.variant === 'boathouse' || Math.abs(house.z - pierZ) > 14 || house.x < pier.x0 - 20
  })

  const deck = pier.deckHeight
  const crates: TownCrate[] = [
    { x: pierRoot + 20, z: pierZ - 1, y: deck, size: 1.1, yaw: 0.2 },
    { x: pierRoot + 21.4, z: pierZ - 1.2, y: deck, size: 0.9, yaw: -0.3 },
    { x: pierRoot + 21, z: pierZ - 1.1, y: deck + 1.1, size: 0.8, yaw: 0.5 },
    { x: pierRoot + 66, z: pierZ + 1, y: deck, size: 1.2, yaw: 0.1 },
    { x: pierRoot + 34, z: pierZ + 18, y: deck, size: 1, yaw: -0.2 },
    { x: pierRoot - 6, z: pierZ + 5, y: ground(pierRoot - 6, pierZ + 5), size: 1, yaw: 0.4 },
  ]
  const barrels: TownBarrel[] = [
    { x: pierRoot + 24, z: pierZ + 1.2, y: deck },
    { x: pierRoot + 25, z: pierZ + 1.5, y: deck },
    { x: pierRoot + 68, z: pierZ - 1, y: deck },
    { x: pierRoot - 8, z: pierZ - 4, y: ground(pierRoot - 8, pierZ - 4) },
  ]

  // The net rack on the beach north of the pier, between the shore lane and the water.
  const rackZ = -22
  const rack: TownRack = {
    x: shoreAt(rackZ) - 12,
    z: rackZ,
    yaw: Math.atan2(slope(rackZ), 1) + Math.PI / 2,
    length: 7,
  }

  // Roads. Two lanes follow the shore contour, one in front of each row of houses; the pier road
  // joins them to the pier; every door gets a gently bent spur to the nearest lane.
  const roadRandom = mulberry32(config.seed + 1)
  const lane = (offset: number, z0: number, z1: number): [number, number][] => {
    const points: [number, number][] = []
    for (let z = z0; z <= z1; z += 10) {
      const inv = 1 / Math.hypot(1, slope(z))
      points.push([shoreAt(z) - offset * inv, z + offset * slope(z) * inv])
    }
    return points
  }
  const shoreLane = lane(20, -104, lighthouse.z)
  const backLane = lane(55, -84, 112)
  const pierRoad: [number, number][] = [
    [pier.x0 + 3, pier.z],
    [(pier.x0 + backLane[0]![0]) / 2, pier.z + 1.5],
    nearestOn(backLane, pier.x0 - 40, pier.z),
  ]
  const roads: TownRoad[] = [
    { points: shoreLane, width: 5 },
    { points: backLane, width: 4.4 },
    { points: pierRoad, width: 4.2 },
  ]
  for (const house of kept) {
    const door = doorPoint(house)
    const target = nearestOn(house.x > shoreAt(house.z) - 45 ? shoreLane : backLane, ...door)
    const wobble = (roadRandom() - 0.5) * 3
    const mid: [number, number] = [
      (door[0] + target[0]) / 2 + wobble * 0.3,
      (door[1] + target[1]) / 2 + wobble,
    ]
    roads.push({ points: [door, mid, target], width: 2.2 })
  }

  const footprints: TownCircle[] = [
    ...kept.map((h) => ({
      x: h.x,
      z: h.z,
      radius: Math.hypot(h.length, h.width) / 2 + 4,
    })),
    { x: lighthouse.x, z: lighthouse.z, radius: lighthouse.radius + 8 },
    { x: rack.x, z: rack.z, radius: rack.length / 2 + 4 },
    { x: pierRoot - 6, z: pierZ, radius: 14 },
    // Road circles, every ~16 m along each road, keep trees off the dirt.
    ...roads
      .slice(0, 3)
      .flatMap((road) =>
        road.points
          .filter((_, k) => k % 2 === 0)
          .map(([x, z]) => ({ x, z, radius: road.width / 2 + 6 })),
      ),
  ]

  return {
    houses: kept,
    roads,
    pier,
    fingers,
    crates,
    barrels,
    rack,
    lighthouse,
    shoreAt,
    footprints,
  }
}
