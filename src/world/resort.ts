import { heightAt } from './heightfield'
import { seaIslands, townSite, type IslandSite } from './sea'
import { planResort, type ResortLayout } from './resortLayout'
import { TERRAIN_CONFIG, type TerrainConfig } from './terrainConfig'

// The resort in the world (#235): where it stands on the largest island, read by `Landmarks.tsx`
// (the model), the foliage exclusions and the tests. Like the town it is not one of the five
// `Landmark`s: its jetty and bungalows stand in the shallows.

/** m, how far inland of the waterline the lodge stands, on the beach's top */
export const LODGE_INLAND = 60
/** m of height over the water at or under which the waterline is taken to be */
const SHORE_HEIGHT = 0.3

export interface Resort {
  /** World position of the model's origin: the lodge's ground point. */
  x: number
  y: number
  z: number
  /** radians about Y: the model's +x (seaward) points toward the town, across the water */
  yaw: number
  island: IslandSite
  layout: ResortLayout
  /** The terrain relative to the origin, in the model's frame, so stilts reach the bed. */
  ground: (x: number, z: number) => number
  /** World circles foliage keeps clear of. */
  footprints: readonly { x: number; z: number; radius: number }[]
}

/** The largest island: the resort's site. */
export function resortIsland(config: TerrainConfig = TERRAIN_CONFIG): IslandSite {
  const islands = seaIslands(config)
  const largest = islands.reduce((a, b) => (b.radius > a.radius ? b : a), islands[0]!)
  return largest
}

/** Where the lodge stands: `LODGE_INLAND` m in from the island's shore on the bearing to the town. */
export function resortAnchor(config: TerrainConfig = TERRAIN_CONFIG): {
  x: number
  z: number
  yaw: number
} {
  const island = resortIsland(config)
  const town = townSite(config)
  const length = Math.hypot(town.x - island.x, town.z - island.z)
  // Seaward is the direction from the island's middle toward the town, over the open water.
  const ux = (town.x - island.x) / length
  const uz = (town.z - island.z) / length
  let shore = island.maxRadius
  for (; shore > 0; shore -= 2) {
    const over = heightAt(island.x + ux * shore, island.z + uz * shore, config) - config.waterLevel
    if (over > SHORE_HEIGHT) break
  }
  const r = shore - LODGE_INLAND
  return { x: island.x + ux * r, z: island.z + uz * r, yaw: Math.atan2(-uz, ux) }
}

let cached: Resort | null = null

/** The resort for the fixed world seed, planned once. */
export function getResort(): Resort {
  if (cached) return cached
  const config = TERRAIN_CONFIG
  const { x, z, yaw } = resortAnchor(config)
  const y = heightAt(x, z, config)
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const ground = (lx: number, lz: number) =>
    heightAt(x + lx * cos + lz * sin, z - lx * sin + lz * cos, config) - y
  const layout = planResort(ground, { waterHeight: config.waterLevel - y })
  cached = {
    x,
    y,
    z,
    yaw,
    island: resortIsland(config),
    layout,
    ground,
    footprints: layout.footprints.map((c) => ({
      x: x + c.x * cos + c.z * sin,
      z: z - c.x * sin + c.z * cos,
      radius: c.radius,
    })),
  }
  return cached
}
