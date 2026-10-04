import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import { GRID_REACH, ROUTE, type NearestRoutePoint, type Route } from './route'
import { LANDMARK_STATIONS } from './routePoints'
import type { RouteValleyConfig, TerrainConfig } from './terrainConfig'

// Pure route valley (#172, roughened by #221). Carves the authored loop between the basin's two
// notches into a valley:
//   floor  inside the floor's half width the ground eases to the route's `floorHeight`, keeping a
//          little terrain detail so it never looks graded flat
//   walls  each side rises over its own run to a shoulder its own lift above the floor (taller
//          terrain keeps its own height)
//   fade   across `fadeWidth` past the shoulder the wall blends back into the terrain
//   gullies a few side valleys cut back through one wall
// The cross-section is not swept unchanged round the loop. Along arc length `s` the floor's width
// breathes, its centre meanders off the route line, one wall steepens to a cliff while the other
// relaxes to a grass slope (swapping sides every 1 to 3 km), and the shoulders carry a ridged
// skyline. All of it comes from a profile table built once per config, interpolated C1 in `s`.
// Around each landmark station and at the joins the width and meander calm back to the route's,
// so stations, gates and the river reaches sit where they were authored.
// Along the route the valley fades in just past the cut and out just before the return notch, where
// the notches already hold the same floor. Every blend is a smoothstep, so the surface is C1.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t

/** Polynomial smooth max: `max(a, b)` with the corner rounded over `k`. C1, and never below max. */
export function smoothMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.max(a, b) + (h * h * k) / 4
}

/** Polynomial smooth min: `min(a, b)` with the corner rounded over `k`. C1, and never above min. */
export function smoothMin(a: number, b: number, k: number): number {
  return -smoothMax(-a, -b, k)
}

/** m, how softly the half-width clamps bend. Inside the band the clamp still holds. */
const CLAMP_SOFTNESS = 20

/**
 * Floor half width for a route half width, given a breathing noise (-1..1) and how calm (0..1)
 * the stretch is. Clamped smoothly, so never under `minHalfWidth` nor over `maxHalfWidth`.
 */
export function valleyHalfWidth(
  routeHalfWidth: number,
  noise: number,
  calm: number,
  valley: RouteValleyConfig,
): number {
  const raw = routeHalfWidth * (1 + valley.widthVariation * noise * (1 - calm))
  const capped = smoothMin(raw, valley.maxHalfWidth, CLAMP_SOFTNESS)
  return smoothMax(capped, valley.minHalfWidth, CLAMP_SOFTNESS)
}

/**
 * 0..1, how much of the width and meander noise is held back at `s`: 1 within `stationClearance`
 * of a landmark station and through the joins, easing to 0 over `calmLength` beyond them.
 */
export function valleyCalm(
  s: number,
  stations: readonly number[],
  span: { readonly start: number; readonly end: number },
  length: number,
  valley: RouteValleyConfig,
): number {
  const { stationClearance: clear, calmLength, joinLength } = valley
  let free =
    smoothstep(span.start + joinLength, span.start + joinLength + calmLength, s) *
    (1 - smoothstep(span.end - joinLength - calmLength, span.end - joinLength, s))
  for (const station of stations) {
    const d = Math.abs(s - station)
    free *= smoothstep(clear, clear + calmLength, Math.min(d, length - d))
  }
  return 1 - free
}

/** The valley's cross-section at one `s`. Sides are by the sign of `NearestRoutePoint.lateral`. */
export interface ValleyProfile {
  /** m, half the floor's width */
  halfWidth: number
  /** m, the floor centre's offset from the route line, with the sign of `lateral` */
  offset: number
  /** m, how far each wall takes to rise, on the negative and positive side */
  riseNeg: number
  risePos: number
  /** m, each wall's shoulder above the floor */
  liftNeg: number
  liftPos: number
}

/** A side valley cut back through one wall. */
export interface Gully {
  /** m of route at its mouth's centre */
  readonly s: number
  /** -1 or 1, the side of the route it opens on */
  readonly side: number
  /** m, mouth width and length back from the floor's edge */
  readonly width: number
  readonly length: number
  /** m of `s` its line drifts per m outward, so it doesn't leave square to the route */
  readonly skew: number
}

const PROFILE_CHANNELS = 6
/** m from the route line a gully's head may reach: inside the route grid, with a margin. */
const GULLY_REACH = GRID_REACH - 20
/** m, nominal spacing of the profile table along the route */
const PROFILE_STEP = 10

interface ValleyShape {
  /** m of route where the valley starts to fade in past the cut, and is gone before the return notch */
  readonly start: number
  readonly end: number
  /** m, the furthest from the route line the valley or a gully reaches */
  readonly reach: number
  readonly length: number
  readonly step: number
  readonly count: number
  readonly table: Float64Array
  readonly gullies: readonly Gully[]
}

/** FNV-1a hash and Mulberry32, as in `heightfield.ts`, which imports this module. */
function seededRandom(key: string): () => number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  let a = hash >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 1D noise round the loop, about -1..1 with features `wavelength` m long. Sampled on a circle of
 * circumference `length`, so it closes on itself where the loop does.
 */
function loopNoise(noise: NoiseFunction2D, s: number, length: number, wavelength: number): number {
  const radius = length / (2 * Math.PI * wavelength)
  const angle = (s / length) * 2 * Math.PI
  return noise(radius * Math.cos(angle), radius * Math.sin(angle))
}

/**
 * Simplex noise seldom strays past ±0.7, so a band the config sets as ±1 would never be used.
 * This spreads it to nearly fill -1..1, smoothly, and never past it.
 */
const spread = (n: number): number => Math.tanh(2 * n)

/** Ridged loop noise, 0..1 with 1 on a crest. A softened `|n|` keeps the crests C1. */
function loopRidge(noise: NoiseFunction2D, s: number, length: number, wavelength: number): number {
  let sum = 0
  let amplitude = 1
  let total = 0
  for (let octave = 0; octave < 2; octave++) {
    const n = loopNoise(noise, s + octave * 1777, length, wavelength / 2.1 ** octave)
    const crest = 1 - Math.sqrt(n * n + 0.01)
    sum += amplitude * crest * crest
    total += amplitude
    amplitude *= 0.5
  }
  return Math.min(1, Math.max(0, sum / total / 0.9))
}

/**
 * Phase of the wall asymmetry along the route: it advances π per swap, each swap 1 to 3 km
 * (`swapLength` ± 40 %), and is scaled to close on a whole number of turns round the loop.
 */
function asymmetryPhase(
  noise: NoiseFunction2D,
  length: number,
  count: number,
  step: number,
  valley: RouteValleyConfig,
): Float64Array {
  const phase = new Float64Array(count + 1)
  const rate = (s: number) =>
    Math.PI / (valley.swapLength * (1 + 0.4 * loopNoise(noise, s, length, valley.swapLength)))
  for (let i = 1; i <= count; i++) {
    phase[i] = phase[i - 1]! + ((rate((i - 1) * step) + rate(i * step)) / 2) * step
  }
  const turns = Math.max(1, Math.round(phase[count]! / (2 * Math.PI)))
  const scale = (turns * 2 * Math.PI) / phase[count]!
  for (let i = 0; i <= count; i++) phase[i] = phase[i]! * scale
  return phase
}

function buildShape(config: TerrainConfig, route: Route): ValleyShape {
  const valley = config.valley
  const [cut, returnNotch] = config.basin.notches
  // The joins run from each notch's route point into the valley, inside the stretch where the
  // notch already holds a flat floor at the route's own floor height. Past it the notch fades
  // back into the ridge, so a join there would leave a hump.
  const start = route.nearest(cut.x, cut.z).s
  const end = route.nearest(returnNotch.x, returnNotch.z).s
  const length = route.length
  const count = Math.round(length / PROFILE_STEP)
  const step = length / count
  const make = (layer: string) => createNoise2D(seededRandom(`${config.seed}:valley:${layer}`))
  const widthNoise = make('width')
  const meanderNoise = make('meander')
  const ridgeNeg = make('ridgeNeg')
  const ridgePos = make('ridgePos')
  const jitterNeg = make('jitterNeg')
  const jitterPos = make('jitterPos')
  const phase = asymmetryPhase(make('swap'), length, count, step, valley)
  const stations = LANDMARK_STATIONS.map((station) => station.s)

  const basin = config.basin
  const basinReach = basin.ridgeRadius + valley.basinClearance

  const table = new Float64Array(count * PROFILE_CHANNELS)
  let reach = 0
  for (let i = 0; i < count; i++) {
    const s = i * step
    const point = route.pointAt(s)
    // Where the route skirts the home basin its inner wall is the basin's designed ridge (#171),
    // so that wall keeps the #172 profile and the floor keeps the route's width and line.
    const tangent = route.tangentAt(s)
    const toBasinX = basin.centerX - point.x
    const toBasinZ = basin.centerZ - point.z
    const basinNear =
      1 - smoothstep(basinReach, basinReach + valley.calmLength, Math.hypot(toBasinX, toBasinZ))
    const basinSide = -tangent.z * toBasinX + tangent.x * toBasinZ < 0 ? -1 : 1
    const calm = Math.max(valleyCalm(s, stations, { start, end }, length, valley), basinNear)
    const routeHalf = point.valleyWidth / 2
    const widthN = spread(loopNoise(widthNoise, s, length, valley.widthWavelength))
    const halfWidth = valleyHalfWidth(routeHalf, widthN, calm, valley)
    const meander = spread(loopNoise(meanderNoise, s, length, valley.meanderWavelength))
    const offset = valley.meander * meander * (1 - calm)
    // Which wall is the cliff: positive side where the swap wave is up, negative where it's down.
    const steepPos = smoothstep(-0.5, 0.5, Math.sin(phase[i]!))
    const side = (
      sign: number,
      steep: number,
      ridge: NoiseFunction2D,
      jitter: NoiseFunction2D,
    ): readonly [number, number] => {
      const j = loopNoise(jitter, s, length, valley.jitterWavelength)
      const rise = mix(valley.grassRise, valley.cliffRise, steep) * (1 + valley.riseJitter * j)
      const crest = loopRidge(ridge, s, length, valley.shoulderWavelength)
      const lift =
        mix(valley.grassLift, valley.cliffLift, steep) + valley.shoulderNoise * (2 * crest - 1)
      const held = sign === basinSide ? basinNear : 0
      return [mix(rise, valley.neutralRise, held), mix(lift, valley.neutralLift, held)]
    }
    const [riseNeg, liftNeg] = side(-1, 1 - steepPos, ridgeNeg, jitterNeg)
    const [risePos, liftPos] = side(1, steepPos, ridgePos, jitterPos)
    const o = i * PROFILE_CHANNELS
    table[o] = halfWidth
    table[o + 1] = offset
    table[o + 2] = riseNeg
    table[o + 3] = risePos
    table[o + 4] = liftNeg
    table[o + 5] = liftPos
    reach = Math.max(reach, halfWidth + Math.abs(offset) + Math.max(riseNeg, risePos))
  }
  reach += valley.fadeWidth
  const shape = { start, end, reach, length, step, count, table, gullies: [] as Gully[] }
  shape.gullies = placeGullies(shape, config, route, stations)
  for (const gully of shape.gullies) {
    const p = profileFrom(shape, gully.s, scratch)
    reach = Math.max(reach, p.halfWidth + Math.abs(p.offset) + gully.length)
  }
  return { ...shape, reach }
}

/**
 * Picks the side gullies: `count` mouths at seeded random `s` between the joins, at least
 * `spacing` apart, each clear of every station by `stationClearance` across its whole mouth, and
 * none in a tight bend (where another stretch of route is near). Each is cut short enough to stay
 * inside the route grid's reach.
 */
function placeGullies(
  shape: Omit<ValleyShape, 'gullies'>,
  config: TerrainConfig,
  route: Route,
  stations: readonly number[],
): Gully[] {
  const valley = config.valley
  const g = valley.gullies
  const random = seededRandom(`${config.seed}:valley:gullies`)
  const placed: Gully[] = []
  const from = shape.start + valley.joinLength + valley.calmLength
  const to = shape.end - valley.joinLength - valley.calmLength
  const profile: ValleyProfile = { ...scratch }
  for (let attempt = 0; attempt < 400 && placed.length < g.count; attempt++) {
    const s = mix(from, to, random())
    const side = random() < 0.5 ? -1 : 1
    const width = mix(g.minWidth, g.maxWidth, random())
    const skew = g.skew * (2 * random() - 1)
    profileFrom(shape, s, profile)
    const edge = profile.halfWidth + side * profile.offset
    const length = Math.min(mix(g.minLength, g.maxLength, random()), GULLY_REACH - edge)
    if (length < g.minLength) continue
    // Its whole footprint along the route, mouth to head.
    const sweep = width / 2 + Math.abs(skew) * length
    if (placed.some((other) => Math.abs(other.s - s) < g.spacing)) continue
    if (stations.some((station) => Math.abs(station - s) < valley.stationClearance + sweep))
      continue
    if (s - sweep < from || s + sweep > to) continue
    let bend = false
    for (const along of [-sweep, 0, sweep]) {
      for (const out of [0, length / 2, length]) {
        const at = s + along + skew * out
        const point = route.pointAt(at)
        const tangent = route.tangentAt(at)
        const lateral = side * (edge + out)
        const x = point.x - tangent.z * lateral
        const z = point.z + tangent.x * lateral
        if (route.rival(x, z, valley.bendBlend) || Math.abs(route.nearest(x, z).s - at) > 40) {
          bend = true
        }
      }
    }
    if (bend) continue
    placed.push({ s, side, width, length, skew })
  }
  return placed.sort((a, b) => a.s - b.s)
}

// `heightAt` runs ~300k times per tile ring, so the shape is worked out once per config object,
// and the last one is kept to hand without a map lookup.
const shapes = new WeakMap<TerrainConfig, ValleyShape>()
let lastConfig: TerrainConfig | null = null
let lastShape: ValleyShape | null = null

function shapeFor(config: TerrainConfig, route: Route): ValleyShape {
  if (config === lastConfig && route === ROUTE) return lastShape!
  let shape = route === ROUTE ? shapes.get(config) : undefined
  if (!shape) {
    shape = buildShape(config, route)
    if (route !== ROUTE) return shape
    shapes.set(config, shape)
  }
  lastConfig = config
  lastShape = shape
  return shape
}

const scratch: ValleyProfile = {
  halfWidth: 0,
  offset: 0,
  riseNeg: 0,
  risePos: 0,
  liftNeg: 0,
  liftPos: 0,
}

/** The profile at `s`, by uniform Catmull-Rom through the table: C1 in `s`, and round the wrap. */
function profileFrom(
  shape: Pick<ValleyShape, 'step' | 'count' | 'table' | 'length'>,
  s: number,
  out: ValleyProfile,
): ValleyProfile {
  const { step, count, table } = shape
  const u = (((s % shape.length) + shape.length) % shape.length) / step
  const i = Math.floor(u)
  const t = u - i
  const o0 = ((i - 1 + count) % count) * PROFILE_CHANNELS
  const o1 = (i % count) * PROFILE_CHANNELS
  const o2 = ((i + 1) % count) * PROFILE_CHANNELS
  const o3 = ((i + 2) % count) * PROFILE_CHANNELS
  const t2 = t * t
  const t3 = t2 * t
  const w0 = (-t3 + 2 * t2 - t) / 2
  const w1 = (3 * t3 - 5 * t2 + 2) / 2
  const w2 = (-3 * t3 + 4 * t2 + t) / 2
  const w3 = (t3 - t2) / 2
  const at = (c: number) =>
    w0 * table[o0 + c]! + w1 * table[o1 + c]! + w2 * table[o2 + c]! + w3 * table[o3 + c]!
  out.halfWidth = at(0)
  out.offset = at(1)
  out.riseNeg = at(2)
  out.risePos = at(3)
  out.liftNeg = at(4)
  out.liftPos = at(5)
  return out
}

/** The valley's cross-section at `s` along the route. A fresh object, for tests and tools. */
export function valleyProfileAt(s: number, config: TerrainConfig, route = ROUTE): ValleyProfile {
  return profileFrom(shapeFor(config, route), s, { ...scratch })
}

/** m, the furthest from the route line the valley reaches. At most `GRID_REACH` keeps it cheap. */
export function valleyReach(config: TerrainConfig, route = ROUTE): number {
  return shapeFor(config, route).reach
}

/** The side gullies the valley carves. */
export function valleyGullies(config: TerrainConfig, route = ROUTE): readonly Gully[] {
  return shapeFor(config, route).gullies
}

/** m of route from `start` to `end`, the valley's weight at `s`. */
export function valleyWeight(s: number, start: number, end: number, joinLength: number): number {
  return smoothstep(start, start + joinLength, s) * (1 - smoothstep(end - joinLength, end, s))
}

/**
 * Where a point sits relative to the valley. `weight` (0..1) is how much of the valley applies:
 * 0 inside the basin, 1 between the joins. `profile` is the cross-section at the nearest point.
 * Inside a tight bend, where another stretch of route is nearly as near, `rival` is that stretch
 * and `rivalPull` (0..1) how far the ground goes toward the lower of the two stretches' profiles.
 * One stretch's wall then gives way to the other's floor, the two floors merge, and nothing jumps
 * where the nearest stretch changes.
 */
export interface ValleyHit {
  readonly nearest: NearestRoutePoint
  readonly profile: ValleyProfile
  readonly weight: number
  readonly rival: NearestRoutePoint | null
  readonly rivalProfile: ValleyProfile
  readonly rivalWeight: number
  readonly rivalPull: number
  /** The valley's side gullies, cut into the nearest stretch's walls. */
  readonly gullies: readonly Gully[]
}

// One hit, reused: `heightAt` asks per vertex and consumes the hit straight away.
const hit: { -readonly [K in keyof ValleyHit]: ValleyHit[K] } = {
  nearest: null as unknown as NearestRoutePoint,
  profile: { ...scratch },
  weight: 0,
  rival: null,
  rivalProfile: { ...scratch },
  rivalWeight: 0,
  rivalPull: 0,
  gullies: [],
}

/** m, distance from the floor centre, on the floor's own side of it. */
const centred = (point: NearestRoutePoint, profile: ValleyProfile): number =>
  point.lateral - profile.offset

function inReach(
  point: NearestRoutePoint,
  profile: ValleyProfile,
  shape: ValleyShape,
  valley: RouteValleyConfig,
): boolean {
  const lateral = centred(point, profile)
  const rise = lateral < 0 ? profile.riseNeg : profile.risePos
  if (Math.abs(lateral) < profile.halfWidth + rise + valley.fadeWidth) return true
  for (const gully of shape.gullies) {
    if (Math.abs(point.s - gully.s) < gully.width + Math.abs(gully.skew) * gully.length) {
      return true
    }
  }
  return false
}

/**
 * The valley at (x, z), or null when the point is beyond its reach or inside the basin. The hit is
 * reused by the next call, so use it before asking again.
 */
export function valleyAt(
  x: number,
  z: number,
  config: TerrainConfig,
  route = ROUTE,
): ValleyHit | null {
  const shape = shapeFor(config, route)
  const valley = config.valley
  const nearest = route.nearest(x, z, shape.reach)
  if (!nearest) return null
  profileFrom(shape, nearest.s, hit.profile)
  const weight = inReach(nearest, hit.profile, shape, valley)
    ? valleyWeight(nearest.s, shape.start, shape.end, valley.joinLength)
    : 0
  const rival = route.rival(x, z, valley.bendBlend)
  let rivalWeight = 0
  let rivalPull = 0
  if (rival) {
    profileFrom(shape, rival.s, hit.rivalProfile)
    rivalWeight = inReach(rival, hit.rivalProfile, shape, valley)
      ? valleyWeight(rival.s, shape.start, shape.end, valley.joinLength)
      : 0
    // In full on the line where both are as near (so swapping them changes nothing), fading out
    // as the rival falls behind. Where the rival first appears as a separate stretch it is already
    // behind, with no prominence yet, and the fade narrows to a metre so it starts from nothing.
    const lead = Math.abs(rival.lateral) - Math.abs(nearest.lateral)
    const fade = 1 + valley.bendBlend * smoothstep(0, valley.bendBlend, rival.prominence)
    rivalPull = 1 - smoothstep(0, fade, lead)
  }
  if (weight <= 0 && rivalWeight <= 0) return null
  hit.nearest = nearest
  hit.weight = weight
  hit.rival = rival
  hit.rivalWeight = rivalWeight
  hit.rivalPull = rivalPull
  hit.gullies = shape.gullies
  return hit
}

/**
 * Valley floor height at `point`, given a smooth `detail` noise (-1..1). The detail only lifts the
 * floor, so the route's `floorHeight` stays its lowest point and the low river reaches stay dry.
 */
export function valleyFloor(
  detail: number,
  point: NearestRoutePoint,
  valley: RouteValleyConfig,
): number {
  return point.floorHeight + valley.floorNoise * (detail + 1) * 0.5
}

/**
 * True where the valley alone decides the height: on the floor, between the joins, with no other
 * stretch of route to blend in. There the terrain underneath doesn't matter, so `heightAt` skips
 * building it.
 */
export function isFullFloor(hit: ValleyHit): boolean {
  return (
    hit.weight === 1 &&
    hit.rivalPull === 0 &&
    Math.abs(centred(hit.nearest, hit.profile)) <= hit.profile.halfWidth
  )
}

/**
 * 0..1, how much of the valley's corridor (floor and walls, up to each shoulder) covers `point`,
 * fading out over `fadeWidth` past the shoulder.
 */
export function corridorShare(
  point: NearestRoutePoint,
  profile: ValleyProfile,
  valley: RouteValleyConfig,
): number {
  const lateral = centred(point, profile)
  const shoulder = profile.halfWidth + (lateral < 0 ? profile.riseNeg : profile.risePos)
  return 1 - smoothstep(shoulder, shoulder + valley.fadeWidth, Math.abs(lateral))
}

/** One stretch's valley profile at `point`, applied to the terrain's `height` by `weight`. */
function carve(
  height: number,
  detail: number,
  point: NearestRoutePoint,
  profile: ValleyProfile,
  weight: number,
  valley: RouteValleyConfig,
): number {
  if (weight <= 0) return height
  const lateral = centred(point, profile)
  const distance = Math.abs(lateral)
  const halfFloor = profile.halfWidth
  // Each side's wall is its own; at the floor centre both sit flat on the floor, so the switch
  // between them is seamless.
  const rise = lateral < 0 ? profile.riseNeg : profile.risePos
  const lift = lateral < 0 ? profile.liftNeg : profile.liftPos
  const shoulder = halfFloor + rise
  const floor = valleyFloor(detail, point, valley)
  const up = smoothstep(halfFloor, shoulder, distance)
  const fade = smoothstep(shoulder, shoulder + valley.fadeWidth, distance)
  const wall = smoothMax(height, point.floorHeight + lift, valley.wallSoftness)
  const carved = mix(mix(floor, wall, up), height, fade)
  return mix(height, carved, weight)
}

/**
 * Cuts the side gullies into `height`: each a flat-bottomed notch through its wall whose bed climbs
 * away from the floor, narrowing out at its head. Off the floor's edge it only ever lowers ground.
 */
export function cutGullies(
  height: number,
  point: NearestRoutePoint,
  profile: ValleyProfile,
  weight: number,
  gullies: readonly Gully[],
  valley: RouteValleyConfig,
): number {
  if (weight <= 0) return height
  const g = valley.gullies
  const lateral = centred(point, profile)
  let out = height
  for (const gully of gullies) {
    const along = Math.abs(point.s - gully.s)
    if (along > gully.width + Math.abs(gully.skew) * gully.length) continue
    // m outward from the floor's edge on the gully's side. On the floor (out < 0) the bed sits
    // above the floor by more than the smoothing, so the cut leaves the floor exactly as it was.
    const outward = gully.side * lateral - profile.halfWidth
    const across = Math.abs(point.s - (gully.s + gully.skew * Math.max(0, outward)))
    const half = gully.width / 2
    const mask =
      (1 - smoothstep(half * g.bedShare, half, across)) *
      smoothstep(-40, 0, outward) *
      (1 - smoothstep(gully.length * 0.6, gully.length, outward))
    if (mask <= 0) continue
    const bed =
      point.floorHeight +
      valley.floorNoise +
      g.softness +
      g.climb * gully.length * smoothstep(0, gully.length, outward)
    out = mix(out, smoothMin(out, bed, g.softness), mask * weight)
  }
  return out
}

/**
 * Valley height, given the terrain's own `height` at the hit and a smooth `detail` noise (-1..1)
 * for the floor.
 */
export function applyRouteValley(
  height: number,
  detail: number,
  hit: ValleyHit,
  valley: RouteValleyConfig,
): number {
  if (isFullFloor(hit)) return valleyFloor(detail, hit.nearest, valley)
  const carved = carve(height, detail, hit.nearest, hit.profile, hit.weight, valley)
  const own = cutGullies(carved, hit.nearest, hit.profile, hit.weight, hit.gullies, valley)
  if (!hit.rival || hit.rivalPull <= 0) return own
  const rival = carve(height, detail, hit.rival, hit.rivalProfile, hit.rivalWeight, valley)
  // The lower of the two, softly: a convex blend, so unlike a smooth min it never dips below both.
  // Swapping the two gives the same height, which keeps it continuous where they swap.
  const lower = mix(own, rival, smoothstep(-valley.wallSoftness, valley.wallSoftness, own - rival))
  return mix(own, lower, hit.rivalPull)
}
