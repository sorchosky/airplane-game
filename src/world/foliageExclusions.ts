import type { FoliageExclusion } from './scatter'

// Where foliage must not grow: the hook landmarks (#76) use to keep trees and grass off their
// footprints. Register a circle before or after the scene mounts; `Foliage` and `Grass` notice the
// version change and re-scatter.
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
