import { ROUTE, type Route } from './route'
import { LANDMARK_STATIONS, type LandmarkStation } from './routePoints'
import type { PlungePoolConfig, TerrainConfig } from './terrainConfig'

// Landmark stations (#173) as world positions. Pure, and free of `heightAt`, so the terrain can
// read it too: the waterfall's plunge pool is dug where its station says.

/** Forward vector of a heading/bearing, in the flight model's convention. */
export function bearingVector(bearing: number): [number, number] {
  return [-Math.sin(bearing), -Math.cos(bearing)]
}

/** Bearing from (fromX, fromZ) to (toX, toZ): the heading that flies straight at it. */
export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ))
}

/** World (x, z) of a point `lateral` m off the route at `s`, signed as `NearestRoutePoint.lateral`. */
export function stationPosition(
  station: Pick<LandmarkStation, 's' | 'lateral'>,
  route: Route = ROUTE,
): { x: number; z: number } {
  const point = route.pointAt(station.s)
  const tangent = route.tangentAt(station.s)
  return { x: point.x - tangent.z * station.lateral, z: point.z + tangent.x * station.lateral }
}

/** The station for a landmark kind. Every kind has one. */
export function stationFor(kind: LandmarkStation['kind']): LandmarkStation {
  const station = LANDMARK_STATIONS.find((candidate) => candidate.kind === kind)
  if (!station) throw new Error(`no station for ${kind}`)
  return station
}

/** The waterfall faces across the floor to the route at its station, so it falls toward the player. */
export function waterfallYaw(route: Route = ROUTE): number {
  const station = stationFor('waterfall')
  const origin = stationPosition(station, route)
  const point = route.pointAt(station.s)
  return bearingTo(origin.x, origin.z, point.x, point.z)
}

/** World (x, z) of the plunge pool's centre, in front of the waterfall. */
export function plungePoolCenter(
  pool: PlungePoolConfig,
  route: Route = ROUTE,
): { x: number; z: number } {
  const origin = stationPosition(stationFor('waterfall'), route)
  const [fx, fz] = bearingVector(waterfallYaw(route))
  return { x: origin.x + fx * pool.centerDistance, z: origin.z + fz * pool.centerDistance }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// `heightAt` runs per vertex, so the centre is worked out once per pool config.
let lastPool: PlungePoolConfig | null = null
let lastCenter = { x: 0, z: 0 }

/**
 * Digs the plunge pool into `height` at (x, z): the bed `depth` below the water inside
 * `innerRadius`, easing back to the ground by `outerRadius`. Everywhere else costs one distance
 * check.
 */
export function applyPlungePool(
  x: number,
  z: number,
  height: number,
  config: TerrainConfig,
): number {
  const pool = config.plungePool
  if (pool !== lastPool) {
    lastCenter = plungePoolCenter(pool)
    lastPool = pool
  }
  const dx = x - lastCenter.x
  const dz = z - lastCenter.z
  const distance2 = dx * dx + dz * dz
  if (distance2 >= pool.outerRadius * pool.outerRadius) return height
  const bed = config.waterLevel - pool.depth
  if (height <= bed) return height
  const blend = smoothstep(pool.innerRadius, pool.outerRadius, Math.sqrt(distance2))
  return bed + (height - bed) * blend
}
