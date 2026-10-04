import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import { ROUTE, type Route } from './route'
import { hashString, mulberry32 } from './seeded'
import { LANDMARK_STATIONS } from './routePoints'
import type { SeaConfig, SeaIsland, TerrainConfig } from './terrainConfig'

// Pure inland sea (#223). A body of water east of the loop's east river reach, ocean in scale so
// it reads as a soft edge: about two minutes of open water with nothing to fly to, its far shore
// lost in the haze. There is one water plane (`waterLevel`), so the sea is terrain carved under it:
//   outline  a polar radius round an authored centre: an ellipse, authored bays (out) and
//            headlands (in) as soft bumps by bearing, and 5 octaves of noise round the ring, kept
//            calm on the west shore that faces the route
//   inside   the bed `bedDepth` under the water, shelving up to the shore over 40 to 120 m. Inside
//            the outline the sea is fully authored, so `heightAt` skips the land noise there
//   islands  low domes with wide beaches and wider shallows, standing on the bed
//   shore    on land the ground is capped by a ramp from the waterline: a 36 to 42 m beach, then on
//            the west a meadow before the hills, so the valley's east wall opens onto the water;
//            elsewhere the shore rises straight into hills
//   town     a flat pad on the west shore at the `town` station, for #224
//   inlet    the route river's branch from the floor to the west shore, south of the town
// Bearings are degrees clockwise from north (-Z), as the basin's crest points.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const DEG = Math.PI / 180
/** radians of bearing between the samples the outline's slope is measured across */
const SLOPE_STEP = 0.002

/** Bearing (radians, clockwise from -Z) of the direction (dx, dz). */
function bearingOf(dx: number, dz: number): number {
  const b = Math.atan2(dx, -dz)
  return b < 0 ? b + Math.PI * 2 : b
}

/** Smallest signed difference a - b between two bearings, radians, -π..π. */
function bearingDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

interface Prepared {
  readonly sea: SeaConfig
  readonly waterLevel: number
  readonly outline: NoiseFunction2D
  readonly shore: NoiseFunction2D
  readonly islandNoise: readonly NoiseFunction2D[]
  /** m, a square round the centre beyond which nothing of the sea reaches */
  readonly reach: number
  /** m, the most an island's noisy radius reaches */
  readonly islandReach: readonly number[]
  readonly town: { readonly x: number; readonly z: number }
  readonly inlet: {
    readonly ax: number
    readonly az: number
    readonly bx: number
    readonly bz: number
  }
}

const preparedFor = new WeakMap<SeaConfig, Prepared>()
let lastSea: SeaConfig | null = null
let lastPrepared: Prepared | null = null

function prepare(config: TerrainConfig): Prepared {
  const sea = config.sea
  if (sea === lastSea && lastPrepared) return lastPrepared
  let prepared = preparedFor.get(sea)
  if (!prepared) {
    prepared = prepareFresh(config)
    preparedFor.set(sea, prepared)
  }
  lastSea = sea
  lastPrepared = prepared
  return prepared
}

function prepareFresh(config: TerrainConfig, route: Route = ROUTE): Prepared {
  const sea = config.sea
  const make = (layer: string) =>
    createNoise2D(mulberry32(hashString(`${config.seed}:sea:${layer}`)))
  const islandNoise = sea.islands.map((island) => make(`island:${island.name}`))
  const base = {
    sea,
    waterLevel: config.waterLevel,
    outline: make('outline'),
    shore: make('shore'),
    islandNoise,
  }
  const town = townPosition(route)
  const inlet = inletLine(sea, route, (x, z) => signedDistanceWith(base, x, z))
  // The outline's ellipse, grown by its widest bay and noise, plus the shore's reach inland.
  const grow = 1 + Math.max(0, ...sea.features.map((f) => f.depth)) + sea.noiseAmplitude
  const reach = Math.max(sea.radiusX, sea.radiusZ) * grow + shoreReach(sea)
  const islandReach = sea.islands.map(
    (island) => island.radius * (1 + island.noise) + island.shallows,
  )
  return { ...base, reach, islandReach, town, inlet }
}

/** Unit-free ring noise at a bearing: `octaves` layers sampled round a circle, so it never seams. */
function ringNoise(
  noise: NoiseFunction2D,
  bearing: number,
  frequency: number,
  octaves: number,
): number {
  let sum = 0
  let amplitude = 1
  let total = 0
  let f = frequency
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise(Math.sin(bearing) * f + i * 31.7, Math.cos(bearing) * f)
    total += amplitude
    amplitude *= 0.5
    f *= 2
  }
  return sum / total
}

/** 0..1, how much a bearing faces the route: 1 across the calm west shore, 0 elsewhere. */
function westWeight(sea: SeaConfig, bearing: number): number {
  const off = Math.abs(bearingDelta(bearing, sea.westBearing * DEG)) / DEG
  return 1 - smoothstep(sea.westHalfArc, sea.westHalfArc + sea.westFade, off)
}

/** m, the outline's radius from the sea's centre at `bearing` (radians). */
function radiusAt(p: Pick<Prepared, 'sea' | 'outline'>, bearing: number): number {
  const { sea } = p
  const sx = Math.sin(bearing) / sea.radiusX
  const cz = Math.cos(bearing) / sea.radiusZ
  const ellipse = 1 / Math.sqrt(sx * sx + cz * cz)
  let shape = 1
  for (const feature of sea.features) {
    const off = bearingDelta(bearing, feature.bearing * DEG) / (feature.width * DEG)
    shape += feature.depth * Math.exp(-0.5 * off * off)
  }
  const calm = 1 - (1 - sea.westNoise) * westWeight(sea, bearing)
  const noise = ringNoise(p.outline, bearing, sea.noiseFrequency, sea.noiseOctaves)
  return ellipse * (shape + sea.noiseAmplitude * calm * noise)
}

/**
 * m, how far inside the outline (x, z) is: positive in the water, negative on land. Not an exact
 * distance: the radial gap, divided by how steeply the outline turns there, which is close within
 * a few hundred metres of the shore, the only place it is used as one.
 */
function signedDistanceWith(p: Pick<Prepared, 'sea' | 'outline'>, x: number, z: number): number {
  const dx = x - p.sea.centerX
  const dz = z - p.sea.centerZ
  const rho = Math.hypot(dx, dz)
  const bearing = bearingOf(dx, dz)
  const r = radiusAt(p, bearing)
  const slope =
    (radiusAt(p, bearing + SLOPE_STEP) - radiusAt(p, bearing - SLOPE_STEP)) / (2 * SLOPE_STEP)
  return (r - rho) / Math.sqrt(1 + (slope / r) ** 2)
}

/** m, how far inside the sea's outline (x, z) is: positive in the water, negative on land. */
export function seaDistance(x: number, z: number, config: TerrainConfig): number {
  return signedDistanceWith(prepare(config), x, z)
}

/** m, the outline's radius from the sea's centre at a bearing, in degrees. For maps and tests. */
export function seaRadiusAt(bearingDegrees: number, config: TerrainConfig): number {
  return radiusAt(prepare(config), bearingDegrees * DEG)
}

/** The sea's outline as a closed polyline, `count` points by bearing. For the map. */
export function seaOutline(config: TerrainConfig, count = 720): { x: number; z: number }[] {
  const p = prepare(config)
  return Array.from({ length: count }, (_, i) => {
    const bearing = (i / count) * Math.PI * 2
    const r = radiusAt(p, bearing)
    return { x: p.sea.centerX + Math.sin(bearing) * r, z: p.sea.centerZ - Math.cos(bearing) * r }
  })
}

/** An island's site: its centre and its nominal radius, for #235 and foliage. */
export interface IslandSite {
  readonly name: string
  readonly x: number
  readonly z: number
  /** m, nominal radius of the dry island. The noisy shore wanders `noise` of it either way. */
  readonly radius: number
  /** m, the most the dry island reaches from its centre */
  readonly maxRadius: number
}

/** The islands' centres and radii. Pure: #235's resort and the foliage read the same list. */
export function seaIslands(config: TerrainConfig): readonly IslandSite[] {
  return config.sea.islands.map((island) => ({
    name: island.name,
    x: island.x,
    z: island.z,
    radius: island.radius,
    maxRadius: island.radius * (1 + island.noise),
  }))
}

/** m, height of an island at (x, z): its dome, beach and shallows, or -Infinity out of reach. */
function islandHeight(
  island: SeaIsland,
  noise: NoiseFunction2D,
  x: number,
  z: number,
  waterLevel: number,
  bed: number,
): number {
  const dx = x - island.x
  const dz = z - island.z
  const rho = Math.hypot(dx, dz)
  const bearing = bearingOf(dx, dz)
  const r = island.radius * (1 + island.noise * ringNoise(noise, bearing, 0.9, 3))
  const e = r - rho
  if (e <= -island.shallows) return -Infinity
  if (e <= 0) return bed + (waterLevel - bed) * smoothstep(-island.shallows, 0, e)
  const beachTop = waterLevel + island.beachRise
  if (e <= island.beach) return waterLevel + island.beachRise * smoothstep(0, island.beach, e)
  // The dome: from the beach's top to the peak at the centre, a broad rounded hill.
  const t = smoothstep(island.beach, r, e)
  return beachTop + (waterLevel + island.peak - beachTop) * t
}

/** m, the sea's ground at a point inside the outline `d` m from the shore. */
function seaFloor(p: Prepared, x: number, z: number, d: number, bearing: number): number {
  const { sea, waterLevel } = p
  const bed = waterLevel - sea.bedDepth
  const shallows =
    sea.shallowsMin +
    (sea.shallowsMax - sea.shallowsMin) * (0.5 + 0.5 * ringNoise(p.shore, bearing, 1.6, 2))
  let height = waterLevel - sea.bedDepth * smoothstep(0, shallows, d)
  for (let i = 0; i < sea.islands.length; i++) {
    const island = sea.islands[i]!
    const reach = p.islandReach[i]!
    if (Math.abs(x - island.x) >= reach || Math.abs(z - island.z) >= reach) continue
    height = Math.max(height, islandHeight(island, p.islandNoise[i]!, x, z, waterLevel, bed))
  }
  return height
}

/** m inland past which the shore leaves the land alone, on the widest (west) meadow. */
function shoreReach(sea: SeaConfig): number {
  return sea.beachWidth + sea.meadowWidth + sea.capHold + sea.capFade
}

/**
 * Land `height` at `distance` m from the waterline at `bearing`, under the shore's cap: a beach
 * rising to 36 to 42 m, on the west a meadow, then a slope up into the hills. Past `capHold` m of
 * that slope the cap lets go over `capFade` m, so far hills, the valley's west wall and the massifs
 * keep their own shape.
 */
function shoreShape(p: Prepared, distance: number, bearing: number, height: number): number {
  const { sea, waterLevel } = p
  const west = westWeight(sea, bearing)
  const meadow = sea.beachWidth + west * sea.meadowWidth
  const release = meadow + sea.capHold
  if (distance >= release + sea.capFade) return height
  const beach =
    sea.beachMin + (sea.beachMax - sea.beachMin) * (0.5 + 0.5 * ringNoise(p.shore, bearing, 2.3, 2))
  const slope = sea.hillSlope + (sea.meadowHillSlope - sea.hillSlope) * west
  const cap =
    waterLevel +
    (beach - waterLevel) * smoothstep(0, sea.beachWidth, distance) +
    Math.max(0, distance - meadow) * slope
  let shaped = Math.min(height, cap)
  // Behind the beach, ground under the cap is raised to it, fading out over a second beach width,
  // so no puddles sit on the beach.
  shaped += (cap - shaped) * (1 - smoothstep(sea.beachWidth, sea.beachWidth * 2, distance))
  return shaped + (height - shaped) * smoothstep(release, release + sea.capFade, distance)
}

/**
 * The inside of the outline, if (x, z) is in it: the authored sea floor, with no land under it.
 * `heightAt` asks first and skips the land noise when this answers. Null on land and beyond the
 * sea's reach.
 */
export function seaFloorAt(x: number, z: number, config: TerrainConfig): number | null {
  const p = prepare(config)
  const { sea } = p
  if (Math.abs(x - sea.centerX) >= p.reach || Math.abs(z - sea.centerZ) >= p.reach) return null
  const d = signedDistanceWith(p, x, z)
  if (d <= 0) return null
  const floor = seaFloor(p, x, z, d, bearingOf(x - sea.centerX, z - sea.centerZ))
  return Math.min(floor, inletCarve(p, x, z, floor))
}

/**
 * Shapes land `height` at (x, z) near the sea: the shore's beach, meadow and slope, then the town
 * pad and the inlet. Inside the outline it is the sea floor.
 * Anywhere beyond the sea's reach it costs two comparisons.
 */
export function applySeaShore(x: number, z: number, height: number, config: TerrainConfig): number {
  const p = prepare(config)
  const { sea } = p
  if (Math.abs(x - sea.centerX) >= p.reach || Math.abs(z - sea.centerZ) >= p.reach) return height
  const d = signedDistanceWith(p, x, z)
  if (d > 0) return seaFloorAt(x, z, config) ?? height
  const shaped = townPad(
    p,
    x,
    z,
    shoreShape(p, -d, bearingOf(x - sea.centerX, z - sea.centerZ), height),
  )
  return inletCarve(p, x, z, shaped)
}

/** Flattens the town's pad to `padHeight`, easing back to `height` over `padBlend` m. */
function townPad(p: Prepared, x: number, z: number, height: number): number {
  const pad = p.sea.town
  const distance = Math.hypot(x - p.town.x, z - p.town.z)
  if (distance >= pad.radius + pad.blend) return height
  const keep = smoothstep(pad.radius, pad.radius + pad.blend, distance)
  return pad.height + (height - pad.height) * keep
}

/** Cuts the inlet channel, a straight reach from the route river to past the west shore. */
function inletCarve(p: Prepared, x: number, z: number, height: number): number {
  const { inlet, sea, waterLevel } = p
  const bx = inlet.bx - inlet.ax
  const bz = inlet.bz - inlet.az
  const px = x - inlet.ax
  const pz = z - inlet.az
  const t = Math.min(1, Math.max(0, (px * bx + pz * bz) / (bx * bx + bz * bz)))
  const distance = Math.hypot(px - bx * t, pz - bz * t)
  const outer = sea.inlet.halfWidth + sea.inlet.bankWidth
  if (distance >= outer) return height
  const bed = waterLevel - sea.inlet.depth
  const bank = 1 - smoothstep(sea.inlet.halfWidth, outer, distance)
  return height + (Math.min(height, bed) - height) * bank
}

/** World (x, z) of the town's pad: its station, `lateral` m off the route toward the sea. */
function townPosition(route: Route): { x: number; z: number } {
  const station = LANDMARK_STATIONS.find((candidate) => candidate.kind === 'town')
  if (!station) throw new Error('no town station')
  const point = route.pointAt(station.s)
  const tangent = route.tangentAt(station.s)
  return { x: point.x - tangent.z * station.lateral, z: point.z + tangent.x * station.lateral }
}

/**
 * The inlet's line: from the route's centreline at `inlet.s` square across the floor toward the
 * sea (the pilot's left, flying clockwise), to `inlet.overshoot` m past the west shore.
 */
function inletLine(
  sea: SeaConfig,
  route: Route,
  distanceAt: (x: number, z: number) => number,
): Prepared['inlet'] {
  const point = route.pointAt(sea.inlet.s)
  const tangent = route.tangentAt(sea.inlet.s)
  // Left of the route, the sign `lateral` gives negative.
  const lx = tangent.z
  const lz = -tangent.x
  let reach = 0
  while (reach < 2000 && distanceAt(point.x + lx * reach, point.z + lz * reach) < 0) reach += 5
  reach += sea.inlet.overshoot
  return { ax: point.x, az: point.z, bx: point.x + lx * reach, bz: point.z + lz * reach }
}

/** World (x, z) of the town's pad centre. */
export function townSite(config: TerrainConfig): { x: number; z: number } {
  return prepare(config).town
}

/** The inlet's line, route end first. */
export function inletSegment(config: TerrainConfig): Prepared['inlet'] {
  return prepare(config).inlet
}

/**
 * True where foliage must not grow for the sea: in the water, on its beaches (`beachWidth` back
 * from the waterline) and on the islands, which #235 dresses. Cheap away from the sea.
 */
export function seaKeepsClear(x: number, z: number, config: TerrainConfig): boolean {
  const p = prepare(config)
  const { sea } = p
  if (Math.abs(x - sea.centerX) >= p.reach || Math.abs(z - sea.centerZ) >= p.reach) return false
  return signedDistanceWith(p, x, z) > -sea.beachWidth
}
