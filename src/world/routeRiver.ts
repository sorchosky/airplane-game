import { ROUTE, type NearestRoutePoint, type Route } from './route'
import type { ValleyHit } from './routeValley'
import type { RouteValleyConfig, TerrainConfig } from './terrainConfig'

// Pure route river (#174). A channel runs down the route's centreline wherever the designed floor
// sits in the low band just above the one water plane, and ends in a lake scooped into the return
// notch:
//   channel  a flat bed `depth` under `waterLevel` across `halfWidth`, with banks that ease back
//            into the floor over `bankWidth`
//   taper    as the designed floor rises from `waterLevel + fullFloor` to `waterLevel + dryFloor`
//            the carve fades out, so the bed rises through the water and the river narrows to a
//            point on the floor, never on a slope
//   lake     a round scoop centred on the return notch's route point. The channel fades out inside
//            its full-depth bed, so the join can't be seen.
// Noise rivers (`carveRivers` in `heightfield.ts`) are kept out of the valley corridor by
// `noiseRiverKeep`, so two rivers never cross the floor.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** 0..1, how much channel the designed `floorHeight` holds: 1 low in the band, 0 above it. */
export function channelPresence(floorHeight: number, config: TerrainConfig): number {
  const { waterLevel, river } = config
  return 1 - smoothstep(waterLevel + river.fullFloor, waterLevel + river.dryFloor, floorHeight)
}

interface LakeSpot {
  readonly x: number
  readonly z: number
  /** m of route at the lake's centre. The channel is gone by here. */
  readonly s: number
}

// `heightAt` runs per vertex, so the lake's centre and route position are worked out once per
// config object.
let lastConfig: TerrainConfig | null = null
let lastSpot: LakeSpot | null = null

/** The lake sits on the return notch's route point, where the west river reach meets the basin. */
export function lakeSpot(config: TerrainConfig, route: Route = ROUTE): LakeSpot {
  if (config === lastConfig && route === ROUTE) return lastSpot!
  const notch = config.basin.notches[1]
  const spot = { x: notch.x, z: notch.z, s: route.nearest(notch.x, notch.z).s }
  if (route !== ROUTE) return spot
  lastConfig = config
  lastSpot = spot
  return spot
}

/** 0..1, how much channel there is at `point`: its floor's presence, faded out into the lake. */
export function channelWeight(
  point: NearestRoutePoint,
  config: TerrainConfig,
  lakeS: number,
): number {
  if (point.s >= lakeS) return 0
  const presence = channelPresence(point.floorHeight, config)
  if (presence <= 0) return 0
  return presence * (1 - smoothstep(lakeS - config.river.lake.innerRadius, lakeS, point.s))
}

/** One stretch's channel at `point`, cut into `height`. */
function cutChannel(
  height: number,
  point: NearestRoutePoint,
  config: TerrainConfig,
  lakeS: number,
): number {
  const river = config.river
  const distance = Math.abs(point.lateral)
  if (distance >= river.halfWidth + river.bankWidth) return height
  const weight = channelWeight(point, config, lakeS)
  if (weight <= 0) return height
  const bed = config.waterLevel - river.depth
  const profile = 1 - smoothstep(river.halfWidth, river.halfWidth + river.bankWidth, distance)
  return height + (Math.min(height, bed) - height) * profile * weight
}

/**
 * Cuts the river channel into `height` at a valley hit. Inside a tight bend the rival stretch's
 * channel is cut too, so a channel never stops where the nearest stretch changes.
 */
export function applyRouteRiver(
  height: number,
  hit: ValleyHit,
  config: TerrainConfig,
  route: Route = ROUTE,
): number {
  const lakeS = lakeSpot(config, route).s
  const carved = cutChannel(height, hit.nearest, config, lakeS)
  return hit.rival ? cutChannel(carved, hit.rival, config, lakeS) : carved
}

/**
 * Scoops the lake into `height` at (x, z): the bed `depth` under the water inside `innerRadius`,
 * easing back to the ground by `outerRadius`. Everywhere else costs one distance check.
 */
export function applyRiverLake(
  x: number,
  z: number,
  height: number,
  config: TerrainConfig,
  route: Route = ROUTE,
): number {
  const lake = config.river.lake
  const spot = lakeSpot(config, route)
  const dx = x - spot.x
  const dz = z - spot.z
  const distance2 = dx * dx + dz * dz
  if (distance2 >= lake.outerRadius * lake.outerRadius) return height
  const blend = 1 - smoothstep(lake.innerRadius, lake.outerRadius, Math.sqrt(distance2))
  const bed = config.waterLevel - lake.depth
  return height + (Math.min(height, bed) - height) * blend
}

/** 0..1, how much of one stretch's corridor covers the point: 1 out to the wall shoulder. */
function corridorShare(
  point: NearestRoutePoint,
  weight: number,
  valley: RouteValleyConfig,
): number {
  if (weight <= 0) return 0
  const halfFloor = point.valleyWidth / 2
  const shoulder = halfFloor + valley.flankWidth * valley.wallShare
  return weight * (1 - smoothstep(shoulder, halfFloor + valley.flankWidth, Math.abs(point.lateral)))
}

/**
 * 0..1, how much of a noise river to keep at a valley hit (or 1 where there is none). None across
 * the floor and up the walls, fading back in over the flank's outer fade, so a noise river reaching
 * the valley dies out before its wall instead of crossing the floor.
 */
export function noiseRiverKeep(hit: ValleyHit | null, valley: RouteValleyConfig): number {
  if (!hit) return 1
  const own = corridorShare(hit.nearest, hit.weight, valley)
  const rival = hit.rival ? corridorShare(hit.rival, hit.rivalWeight, valley) : 0
  return 1 - Math.max(own, rival)
}

/**
 * `config` with no route river and no lake, so what the valley and the basin shape on their own can
 * be checked. Noise rivers stay out of the corridor either way.
 */
export function withoutRouteRiver(config: TerrainConfig): TerrainConfig {
  const { river } = config
  return {
    ...config,
    river: {
      ...river,
      // Every floor is above the band, so the channel is nowhere.
      fullFloor: -1e6 - 1,
      dryFloor: -1e6,
      lake: { ...river.lake, innerRadius: 0, outerRadius: 0 },
    },
  }
}
