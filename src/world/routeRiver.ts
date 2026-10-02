import type { ValleyHit } from './routeValley'
import type { RouteRiverConfig, RouteValleyConfig, TerrainConfig } from './terrainConfig'

// Pure route river (#174). There is one water plane, at `waterLevel`, so the river can only run
// where the route's designed floor sits just above it: the low stretches of `docs/world-route.md`.
//   channel  along the route centreline a flat bed `depth` below the water, `halfWidth` either
//            side, with banks that ease back into the valley floor over `bankWidth`
//   taper    as the designed floor rises out of the low band the bed rises with it, through the
//            water surface to `endLift` above it, so the water narrows to a point and stops on the
//            floor; the dry ditch past it then fades out. Floor noise never makes it break up.
//   lake     where the west reach meets the return notch, a round scoop takes the river in, at the
//            rim of the home basin
// The noise rivers (`carveRivers`) are suppressed inside the valley corridor, so two rivers never
// cross the floor. Every blend is a smoothstep, so the surface stays C1.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * Share of the taper (0..1 of `riverTaper`) over which the dry ditch fades in. It has to end before
 * the bed reaches the water, `endLift / (depth + endLift)` of the way up, or water would appear in
 * a half-dug ditch. `routeRiver.test.ts` holds the config to that.
 */
export const DITCH_FADE = 0.25

/**
 * How much of the river applies where the route's designed floor is `floorHeight` and the valley's
 * weight is `valleyWeight`: 1 through the low band, easing to 0 as the floor rises out of it, and 0
 * in the basin and the joins, where the valley itself fades out.
 */
export function riverTaper(
  floorHeight: number,
  valleyWeight: number,
  river: RouteRiverConfig,
  waterLevel: number,
): number {
  const full = waterLevel + river.fullBand
  const dry = waterLevel + river.dryBand
  return (1 - smoothstep(full, dry, floorHeight)) * valleyWeight
}

/** Height of the river bed at taper `taper`: under the water at 1, `endLift` above it at 0. */
export function riverBed(taper: number, river: RouteRiverConfig, waterLevel: number): number {
  return waterLevel - river.depth + (river.depth + river.endLift) * (1 - taper)
}

/**
 * Cuts the river channel into `height`, the valley's height at the hit. Away from the low
 * stretches, or further from the centreline than the banks reach, it returns `height` unchanged.
 */
export function applyRouteRiver(height: number, hit: ValleyHit, config: TerrainConfig): number {
  const river = config.river
  const distance = Math.abs(hit.nearest.lateral)
  const reach = river.halfWidth + river.bankWidth
  if (distance >= reach) return height
  const taper = riverTaper(hit.nearest.floorHeight, hit.weight, river, config.waterLevel)
  if (taper <= 0) return height
  const bed = riverBed(taper, river, config.waterLevel)
  if (height <= bed) return height
  const across = 1 - smoothstep(river.halfWidth, reach, distance)
  return mix(height, bed, across * smoothstep(0, DITCH_FADE, taper))
}

/**
 * 0..1, how far the noise rivers are held back at the hit: fully across the floor and up the walls
 * to the shoulder, easing to nothing at the valley's outer edge, and only as far as the valley
 * itself applies. Inside a tight bend the other stretch counts as far as the valley blends it in.
 */
export function noiseRiverSuppression(hit: ValleyHit, valley: RouteValleyConfig): number {
  const corridor = (lateral: number, valleyWidth: number): number => {
    const halfFloor = valleyWidth / 2
    const shoulder = halfFloor + valley.flankWidth * valley.wallShare
    return 1 - smoothstep(shoulder, halfFloor + valley.flankWidth, Math.abs(lateral))
  }
  const own = hit.weight * corridor(hit.nearest.lateral, hit.nearest.valleyWidth)
  if (!hit.rival || hit.rivalPull <= 0) return own
  const rival = hit.rivalWeight * corridor(hit.rival.lateral, hit.rival.valleyWidth)
  return Math.max(own, rival * hit.rivalPull)
}

/** World (x, z) of the river's lake: on the return notch's route point, where the valley ends. */
export function riverLakeCenter(config: TerrainConfig): { x: number; z: number } {
  const returnNotch = config.basin.notches[1]
  return { x: returnNotch.x, z: returnNotch.z }
}

/**
 * Digs the river's lake into `height` at (x, z): the bed `depth` below the water inside
 * `innerRadius`, easing back to the ground by `outerRadius`. Everywhere else costs one distance
 * check.
 */
export function applyRiverLake(
  x: number,
  z: number,
  height: number,
  config: TerrainConfig,
): number {
  const lake = config.river.lake
  const center = config.basin.notches[1]
  const dx = x - center.x
  const dz = z - center.z
  const distance2 = dx * dx + dz * dz
  if (distance2 >= lake.outerRadius * lake.outerRadius) return height
  const bed = config.waterLevel - lake.depth
  if (height <= bed) return height
  return bed + (height - bed) * smoothstep(lake.innerRadius, lake.outerRadius, Math.sqrt(distance2))
}
