import { getLandmarks } from './landmarks'
import type { FoliageExclusion } from './scatter'
import { townSite } from './sea'
import { TERRAIN_CONFIG } from './terrainConfig'

// Where foliage must not grow. Landmark footprints (#76) are always excluded; anything else placed
// on the ground later (a runway, a camp) registers a circle here, before or after the scene mounts,
// and `Foliage` notices the version change and re-scatters.
//
// ```ts
// const remove = addFoliageExclusion({ x: 1200, z: 800, radius: 60 })
// // ...later, if the landmark goes away
// remove()
// ```

const zones = new Set<FoliageExclusion>()
let version = 0
let snapshot: readonly FoliageExclusion[] = []

/** Keeps foliage out of a circle. Returns a function that lifts the exclusion again. */
export function addFoliageExclusion(zone: FoliageExclusion): () => void {
  const entry = { ...zone }
  zones.add(entry)
  snapshot = [...zones]
  version++
  return () => {
    if (!zones.delete(entry)) return
    snapshot = [...zones]
    version++
  }
}

/** Every exclusion in force. The same array until one is added or removed. */
export function foliageExclusions(): readonly FoliageExclusion[] {
  return snapshot
}

/** Bumped on every add or remove, so streamers can tell their cached scatter is stale. */
export function foliageExclusionVersion(): number {
  return version
}

/** m added around each landmark footprint, so a canopy never overhangs the landmark. */
const LANDMARK_MARGIN = 6

let landmarkZones: readonly FoliageExclusion[] | null = null

/** The town's flat pad on the sea's west shore (#223), kept clear for its buildings (#224). */
function townPadZone(): FoliageExclusion[] {
  const sea = TERRAIN_CONFIG.sea
  if (!sea) return []
  const { x, z } = townSite(TERRAIN_CONFIG)
  return [{ x, z, radius: sea.town.radius + LANDMARK_MARGIN }]
}

/**
 * Landmark footprints and the town pad (grown by `LANDMARK_MARGIN`) plus every registered
 * exclusion. The sea's water, beaches and islands are kept clear by the scatter itself.
 */
export function allFoliageExclusions(): readonly FoliageExclusion[] {
  landmarkZones ??= [
    ...getLandmarks().flatMap((landmark) =>
      landmark.footprints.map((f) => ({ x: f.x, z: f.z, radius: f.radius + LANDMARK_MARGIN })),
    ),
    ...townPadZone(),
  ]
  return snapshot.length === 0 ? landmarkZones : [...landmarkZones, ...snapshot]
}
