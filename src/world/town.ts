import { heightAt } from './heightfield'
import { townSite } from './sea'
import { TERRAIN_CONFIG } from './terrainConfig'
import { planTown, type TownCircle, type TownGround, type TownLayout } from './townLayout'

// The fishing town in the world (#224): its pad, its plan and its footprints. The town is not one
// of the five `Landmark`s (those must stand on dry land at least 6 m over the water; the town
// stands on the shore pad and its pier in the sea), so it has its own placement, read by
// `Landmarks.tsx`, the foliage exclusions and the tests.

export interface Town {
  /** World position of the model's origin: the pad's centre, on the ground. */
  x: number
  y: number
  z: number
  layout: TownLayout
  /** The terrain relative to the origin, so footings and pilings reach it. */
  ground: TownGround
  /** World circles foliage keeps clear of. */
  footprints: readonly TownCircle[]
}

let cached: Town | null = null

/** The town for the fixed world seed, planned once. */
export function getTown(): Town {
  if (cached) return cached
  const { x, z } = townSite(TERRAIN_CONFIG)
  const y = heightAt(x, z, TERRAIN_CONFIG)
  const ground: TownGround = (lx, lz) => heightAt(x + lx, z + lz, TERRAIN_CONFIG) - y
  const layout = planTown(ground, {
    seed: 224,
    waterHeight: TERRAIN_CONFIG.waterLevel - y,
    pierLength: 75,
    laneOffsets: [34, 76],
    lighthouseHeight: 44,
  })
  cached = {
    x,
    y,
    z,
    layout,
    ground,
    footprints: layout.footprints.map((c) => ({ x: x + c.x, z: z + c.z, radius: c.radius })),
  }
  return cached
}
