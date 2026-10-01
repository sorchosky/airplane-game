import { ROUTE, type NearestRoutePoint, type Route } from './route'
import type { RouteValleyConfig, TerrainConfig } from './terrainConfig'

// Pure route valley (#172). Carves the authored loop between the basin's two notches into a valley:
//   floor  inside half the route's `valleyWidth` the ground eases to the route's `floorHeight`,
//          keeping a little terrain detail so it never looks graded flat
//   walls  across the first `wallShare` of the flank the ground rises to a shoulder at least
//          `wallLift` above the floor (taller terrain keeps its own height)
//   fade   across the rest of the flank the shoulder blends back into the terrain
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

interface Span {
  /** m of route where the valley starts to fade in past the cut, and is gone before the return notch */
  readonly start: number
  readonly end: number
  /** m, widest half floor plus the flank: nothing further from the route is touched */
  readonly reach: number
}

// `heightAt` runs ~300k times per tile ring, so the span is worked out once per config object,
// and the last one is kept to hand without a map lookup.
const spans = new WeakMap<TerrainConfig, Span>()
let lastConfig: TerrainConfig | null = null
let lastSpan: Span | null = null

function spanFor(config: TerrainConfig, route: Route): Span {
  if (config === lastConfig && route === ROUTE) return lastSpan!
  let span = route === ROUTE ? spans.get(config) : undefined
  if (!span) {
    const [cut, returnNotch] = config.basin.notches
    let widest = 0
    for (let s = 0; s < route.length; s += 10) {
      widest = Math.max(widest, route.pointAt(s).valleyWidth)
    }
    // The joins run from each notch's route point into the valley, inside the stretch where the
    // notch already holds a flat floor at the route's own floor height. Past it the notch fades
    // back into the ridge, so a join there would leave a hump.
    span = {
      start: route.nearest(cut.x, cut.z).s,
      end: route.nearest(returnNotch.x, returnNotch.z).s,
      reach: widest / 2 + config.valley.flankWidth,
    }
    if (route !== ROUTE) return span
    spans.set(config, span)
  }
  lastConfig = config
  lastSpan = span
  return span
}

/** m of route from `start` to `end`, the valley's weight at `s`. */
export function valleyWeight(s: number, start: number, end: number, joinLength: number): number {
  return smoothstep(start, start + joinLength, s) * (1 - smoothstep(end - joinLength, end, s))
}

/**
 * Where a point sits relative to the valley. `weight` (0..1) is how much of the valley applies:
 * 0 inside the basin, 1 between the joins. Inside a tight bend, where another stretch of route is
 * nearly as near, `rival` is that stretch and `rivalPull` (0..1) how far the ground goes toward
 * the lower of the two stretches' profiles. One stretch's wall then gives way to the other's floor,
 * the two floors merge, and nothing jumps where the nearest stretch changes.
 */
export interface ValleyHit {
  readonly nearest: NearestRoutePoint
  readonly weight: number
  readonly rival: NearestRoutePoint | null
  readonly rivalWeight: number
  readonly rivalPull: number
}

// One hit, reused: `heightAt` asks per vertex and consumes the hit straight away.
const hit: { -readonly [K in keyof ValleyHit]: ValleyHit[K] } = {
  nearest: null as unknown as NearestRoutePoint,
  weight: 0,
  rival: null,
  rivalWeight: 0,
  rivalPull: 0,
}

const inReach = (point: NearestRoutePoint, valley: RouteValleyConfig): boolean =>
  Math.abs(point.lateral) < point.valleyWidth / 2 + valley.flankWidth

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
  const span = spanFor(config, route)
  const valley = config.valley
  const nearest = route.nearest(x, z, span.reach)
  if (!nearest) return null
  const weight = inReach(nearest, valley)
    ? valleyWeight(nearest.s, span.start, span.end, valley.joinLength)
    : 0
  const rival = route.rival(x, z, valley.bendBlend)
  let rivalWeight = 0
  let rivalPull = 0
  if (rival) {
    rivalWeight = inReach(rival, valley)
      ? valleyWeight(rival.s, span.start, span.end, valley.joinLength)
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
    Math.abs(hit.nearest.lateral) <= hit.nearest.valleyWidth / 2
  )
}

/** One stretch's valley profile at `point`, applied to the terrain's `height` by `weight`. */
function carve(
  height: number,
  detail: number,
  point: NearestRoutePoint,
  weight: number,
  valley: RouteValleyConfig,
): number {
  if (weight <= 0) return height
  const distance = Math.abs(point.lateral)
  const halfFloor = point.valleyWidth / 2
  const shoulder = halfFloor + valley.flankWidth * valley.wallShare
  const floor = valleyFloor(detail, point, valley)
  const rise = smoothstep(halfFloor, shoulder, distance)
  const fade = smoothstep(shoulder, halfFloor + valley.flankWidth, distance)
  const wall = smoothMax(height, point.floorHeight + valley.wallLift, valley.wallSoftness)
  const carved = mix(mix(floor, wall, rise), height, fade)
  return mix(height, carved, weight)
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
  const own = carve(height, detail, hit.nearest, hit.weight, valley)
  if (!hit.rival || hit.rivalPull <= 0) return own
  const rival = carve(height, detail, hit.rival, hit.rivalWeight, valley)
  // The lower of the two, softly: a convex blend, so unlike a smooth min it never dips below both.
  // Swapping the two gives the same height, which keeps it continuous where they swap.
  const lower = mix(own, rival, smoothstep(-valley.wallSoftness, valley.wallSoftness, own - rival))
  return mix(own, lower, hit.rivalPull)
}
