import { PALM_VARIANTS } from './models/palm'
import { hashString, heightAt, mulberry32 } from './heightfield'
import { seaIslands } from './sea'
import type { TerrainConfig } from './terrainConfig'

// Where the palms stand (#235): pure and seeded, so the same islands always grow the same grove.
// Palms come in clusters of 3 to 9 on each island's beach and lowland, one cluster for about every
// `CLUSTER_SPACING` m of island radius, and every trunk leans toward the water: down the slope,
// or straight out from the island's middle on flat ground. The list is static; the foliage scatter
// hands each chunk the palms that fall inside it (`scatterChunk`).

/** m of island radius per cluster of palms */
export const CLUSTER_SPACING = 46
/** m over the waterline a palm may stand from: the beach's dry part up to the low dome */
export const PALM_MIN_HEIGHT = 1
export const PALM_MAX_HEIGHT = 8
/** m, how far a palm stands from its cluster's centre */
const CLUSTER_RADIUS = [3, 13] as const
/** m, the step the lean's slope is measured across */
const SLOPE_STEP = 6

/** One palm. Fields as `FoliageInstance`, which it becomes in the scatter. */
export interface PalmSite {
  readonly x: number
  readonly y: number
  readonly z: number
  /** radians about +Y: turns the unit palm's lean (toward +X) to face the water */
  readonly yaw: number
  readonly scale: number
  /** radians of tilt added to the unit trunk's own lean */
  readonly lean: number
  readonly keep: number
  /** which `PALM_VARIANTS` entry */
  readonly variant: number
}

type HeightSampler = (x: number, z: number, config: TerrainConfig) => number

const cache = new WeakMap<TerrainConfig, PalmSite[]>()

/** The palms of every island in `config`. Cached for the default height sampler. */
export function islandPalmSites(
  config: TerrainConfig,
  sample: HeightSampler = heightAt,
): readonly PalmSite[] {
  if (sample === heightAt) {
    const cached = cache.get(config)
    if (cached) return cached
    const sites = plantIslands(config, sample)
    cache.set(config, sites)
    return sites
  }
  return plantIslands(config, sample)
}

function plantIslands(config: TerrainConfig, sample: HeightSampler): PalmSite[] {
  const water = config.waterLevel
  const sites: PalmSite[] = []
  for (const island of seaIslands(config)) {
    const random = mulberry32(hashString(`${config.seed}:palms:${island.name}`))
    const clusters = Math.max(2, Math.round(island.radius / CLUSTER_SPACING))
    for (let c = 0; c < clusters; c++) {
      const centre = pickCentre(island, random, (x, z) => sample(x, z, config) - water)
      if (!centre) continue
      const count = 3 + Math.floor(random() * 7)
      for (let m = 0; m < count; m++) {
        const reach = CLUSTER_RADIUS[0] + random() * (CLUSTER_RADIUS[1] - CLUSTER_RADIUS[0])
        const around = random() * Math.PI * 2
        const x = centre.x + Math.cos(around) * reach
        const z = centre.z + Math.sin(around) * reach
        const keep = random()
        const variantRoll = random()
        const sizeRoll = random()
        const flat = random() * Math.PI * 2
        const height = sample(x, z, config) - water
        if (height < PALM_MIN_HEIGHT || height > PALM_MAX_HEIGHT) continue
        if (Math.hypot(x - island.x, z - island.z) > island.maxRadius) continue
        const variant = Math.min(PALM_VARIANTS.length - 1, Math.floor(variantRoll * 3))
        const shape = PALM_VARIANTS[variant]!
        // Down the slope toward the water; across flat ground, straight out from the middle.
        const gx = sample(x + SLOPE_STEP, z, config) - sample(x - SLOPE_STEP, z, config)
        const gz = sample(x, z + SLOPE_STEP, config) - sample(x, z - SLOPE_STEP, config)
        const slope = Math.hypot(gx, gz) / (2 * SLOPE_STEP)
        const [lx, lz] =
          slope > 0.01
            ? [-gx / (2 * SLOPE_STEP * slope), -gz / (2 * SLOPE_STEP * slope)]
            : unit(x - island.x, z - island.z, flat)
        sites.push({
          x,
          y: sample(x, z, config),
          z,
          yaw: Math.atan2(-lz, lx),
          scale: shape.scale * (0.94 + sizeRoll * 0.12),
          lean: shape.tilt,
          keep,
          variant,
        })
      }
    }
  }
  return sites
}

function unit(dx: number, dz: number, fallback: number): [number, number] {
  const length = Math.hypot(dx, dz)
  return length > 1e-6 ? [dx / length, dz / length] : [Math.cos(fallback), Math.sin(fallback)]
}

/** A spot for a cluster: on the island's beach or lowland, found by a few seeded tries. */
function pickCentre(
  island: { x: number; z: number; maxRadius: number },
  random: () => number,
  heightOver: (x: number, z: number) => number,
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const bearing = random() * Math.PI * 2
    const rho = island.maxRadius * (0.45 + 0.55 * random())
    const x = island.x + Math.sin(bearing) * rho
    const z = island.z - Math.cos(bearing) * rho
    const height = heightOver(x, z)
    if (height >= PALM_MIN_HEIGHT + 0.5 && height <= PALM_MAX_HEIGHT - 1) return { x, z }
  }
  return null
}
