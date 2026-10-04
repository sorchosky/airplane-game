import { heightAt } from './heightfield'
import { ROUTE, type Route, type RoutePoint } from './route'
import type { LandmarkStation } from './routePoints'
import { bearingTo, bearingVector, stationFor, stationPosition, waterfallYaw } from './stations'
import { TERRAIN_CONFIG, type TerrainConfig } from './terrainConfig'

export { bearingTo, bearingVector } from './stations'

// Landmarks (#76): five authored silhouettes along the loop, so the world has places. This module
// is the pure half: where each one stands, its footprint (for foliage to keep clear of), its
// trigger volume (for the golden path, X4) and its sound anchor (for doppler, F3). No React or
// Three; the meshes are built in `models/` and drawn by `Landmarks.tsx`.
//
// Each landmark stands at its station (#173): an arc length along the route and an offset off it,
// authored in `LANDMARK_STATIONS` (`routePoints.ts`). The #76 placement rules (footprint dry, above
// the water and gentler than `maxSlopeDegrees`; at least half the silhouette in sight) are no
// longer searched for here. `landmarks.test.ts` holds every station to them, with the sightline
// taken from the route point `revealDistance` before the station.
//
// Bearings use the flight model's heading convention: bearing `b` points along
// (-sin b, 0, -cos b), so a plane with `heading = b` flies straight at it. 0 is -Z, the direction
// the plane faces at spawn.

/** The kinds with a model. The town's station frames the sea; its buildings come in #224. */
export type LandmarkKind = Exclude<LandmarkStation['kind'], 'town'>

/** A circle on the ground, world m. Foliage (A3) skips anything inside one. */
export interface Footprint {
  x: number
  z: number
  radius: number
}

/** A world-space volume the golden path (X4) can test the plane against. */
export type TriggerVolume =
  | { shape: 'sphere'; center: readonly [number, number, number]; radius: number }
  | {
      shape: 'box'
      center: readonly [number, number, number]
      /** m, half size along the box's own right, up and forward axes */
      halfExtents: readonly [number, number, number]
      /** radians, the box's heading (same convention as bearings) */
      yaw: number
    }

export interface Landmark {
  kind: LandmarkKind
  /** World position of the model's origin: ground level at the landmark's centre. */
  x: number
  y: number
  z: number
  /**
   * Radians. The model's local -Z (its front) points along (-sin yaw, 0, -cos yaw), away from the
   * player arriving down the route. The arch lies across the route so it is flown through; the
   * waterfall faces its pool, across the floor to the route.
   */
  yaw: number
  /** m of route from spawn, and m off it, from the landmark's station. */
  station: number
  lateral: number
  /** m, how far the lowest ground under the footprint drops below `y`. Foundations reach past it. */
  relief: number
  /** m, how tall the silhouette stands above `y`. */
  height: number
  footprints: readonly Footprint[]
  trigger: TriggerVolume
  /** World point the landmark's sound comes from, for the doppler whoosh (F3). */
  soundAnchor: readonly [number, number, number]
  /** Waterfall only: m in front of the origin where the fall meets the lake. */
  plungeDistance?: number
}

export interface LandmarkSpec {
  kind: LandmarkKind
  /** m, radius of ground the landmark stands on (every sample must pass the placement rules) */
  footprintRadius: number
  /** m, silhouette height above its base */
  height: number
}

export interface LandmarkConfig {
  /** degrees, the steepest ground a footprint may stand on */
  maxSlopeDegrees: number
  /** m, the lowest ground may be above `waterLevel` (keeps landmarks off beaches) */
  minHeightAboveWater: number
  /** Samples round each footprint ring, plus its centre. */
  footprintSamples: number
  /** m, how far the slope is measured across (larger = ignores small bumps) */
  slopeProbe: number
  /** m of route before its station that a landmark is revealed */
  revealDistance: number
  /** m above the route's floor the sightline from the reveal starts: low cruise down the valley */
  routeEyeHeight: number
  /** 0..1, how much of a landmark's height must clear the terrain in the sightline from its reveal */
  minVisibleFraction: number
  /** Waterfall only: m from the cliff centre the lake must start, toward the lake. */
  waterfallShoreMin: number
  waterfallShoreMax: number
  /** m below `waterLevel` the ground under the plunge must be, so the fall lands in water */
  waterfallPlungeDepth: number
  /**
   * 0..1, the most the far haze may cover a landmark (acceptance: silhouettes hold at 5 km).
   * Past the terrain's own full fade the cap lets go, reaching 100% at `hazeRelease` × that
   * distance, before the camera's far plane would clip the landmark.
   */
  hazeCap: number
  hazeRelease: number
  specs: readonly LandmarkSpec[]
}

export const LANDMARK_CONFIG: LandmarkConfig = {
  maxSlopeDegrees: 20,
  minHeightAboveWater: 6,
  footprintSamples: 12,
  slopeProbe: 12,
  revealDistance: 1500,
  routeEyeHeight: 50,
  minVisibleFraction: 0.5,
  waterfallShoreMin: 40,
  waterfallShoreMax: 90,
  waterfallPlungeDepth: 2,
  hazeCap: 0.85,
  hazeRelease: 1.2,
  specs: [
    { kind: 'tower', footprintRadius: 30, height: 210 },
    { kind: 'arch', footprintRadius: 70, height: 120 },
    { kind: 'waterfall', footprintRadius: 25, height: 90 },
    { kind: 'tree', footprintRadius: 35, height: 120 },
    { kind: 'ruins', footprintRadius: 110, height: 60 },
  ],
}

/** Smallest absolute difference between two angles, radians, 0..π. */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2)
  return d > Math.PI ? Math.PI * 2 - d : d
}

/**
 * Ground slope in degrees at (x, z), from central differences `probe` m apart. Measured over a few
 * metres rather than one so a single noisy vertex doesn't veto a site.
 */
export function slopeDegreesAt(x: number, z: number, config: TerrainConfig, probe: number): number {
  const dx = (heightAt(x + probe, z, config) - heightAt(x - probe, z, config)) / (2 * probe)
  const dz = (heightAt(x, z + probe, config) - heightAt(x, z - probe, config)) / (2 * probe)
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI
}

interface FootprintSurvey {
  /** true if every sample is on land, above the water and under the slope limit */
  ok: boolean
  center: number
  min: number
  max: number
  maxSlope: number
}

/** Samples the centre and three rings, at 35 %, 70 % and 100 % of the footprint's radius. */
export function surveyFootprint(
  x: number,
  z: number,
  radius: number,
  terrain: TerrainConfig = TERRAIN_CONFIG,
  config: LandmarkConfig = LANDMARK_CONFIG,
): FootprintSurvey {
  const center = heightAt(x, z, terrain)
  let min = center
  let max = center
  let maxSlope = slopeDegreesAt(x, z, terrain, config.slopeProbe)
  const floor = terrain.waterLevel + config.minHeightAboveWater
  let ok = center >= floor && maxSlope < config.maxSlopeDegrees
  for (const ringScale of [0.35, 0.7, 1]) {
    for (let i = 0; i < config.footprintSamples && ok; i++) {
      const angle = (i / config.footprintSamples) * Math.PI * 2
      const sx = x + Math.cos(angle) * radius * ringScale
      const sz = z + Math.sin(angle) * radius * ringScale
      const h = heightAt(sx, sz, terrain)
      const slope = slopeDegreesAt(sx, sz, terrain, config.slopeProbe)
      min = Math.min(min, h)
      max = Math.max(max, h)
      maxSlope = Math.max(maxSlope, slope)
      if (h < floor || slope >= config.maxSlopeDegrees) ok = false
    }
  }
  return { ok, center, min, max, maxSlope }
}

/**
 * Waterfall only: m in front of (x, z), looking along `yaw`, to the first point where the ground
 * and 30 m past it are both `waterfallPlungeDepth` under the water, between `waterfallShoreMin`
 * and `waterfallShoreMax`. Null if there is none. The fall plunges there.
 */
export function plungeDistanceAlong(
  x: number,
  z: number,
  yaw: number,
  terrain: TerrainConfig = TERRAIN_CONFIG,
  config: LandmarkConfig = LANDMARK_CONFIG,
): number | null {
  const plungeHeight = terrain.waterLevel - config.waterfallPlungeDepth
  const [fx, fz] = bearingVector(yaw)
  for (let d = config.waterfallShoreMin; d <= config.waterfallShoreMax; d += 10) {
    // The plunge pool and a little past it must both be water, so the fall lands in a pool, not on
    // the lip of a puddle.
    if (
      heightAt(x + fx * d, z + fz * d, terrain) < plungeHeight &&
      heightAt(x + fx * (d + 30), z + fz * (d + 30), terrain) < plungeHeight
    ) {
      return d
    }
  }
  return null
}

/** The route point a landmark is revealed from: `revealDistance` before its station. */
export function revealPoint(
  landmark: Pick<Landmark, 'station'>,
  route: Route = ROUTE,
  config: LandmarkConfig = LANDMARK_CONFIG,
): RoutePoint {
  return route.pointAt(landmark.station - config.revealDistance)
}

/**
 * 0..1, how much of a landmark `height` m tall standing on ground `baseHeight` at (x, z) shows over
 * the terrain from an eye at (eyeX, eyeY, eyeZ). Walks the sightline every 20 m and finds the
 * steepest terrain elevation angle; the part of the landmark above that line is visible. The walk
 * stops at the edge of the landmark's `footprintRadius`, so its own ground doesn't block it.
 */
export function visibleFraction(
  eye: readonly [number, number, number],
  x: number,
  z: number,
  baseHeight: number,
  height: number,
  footprintRadius: number,
  terrain: TerrainConfig = TERRAIN_CONFIG,
): number {
  const [eyeX, eyeY, eyeZ] = eye
  const distance = Math.hypot(x - eyeX, z - eyeZ)
  let steepest = -Infinity
  for (let t = 20; t < distance - footprintRadius; t += 20) {
    const k = t / distance
    const ground = Math.max(
      heightAt(eyeX + (x - eyeX) * k, eyeZ + (z - eyeZ) * k, terrain),
      terrain.waterLevel,
    )
    steepest = Math.max(steepest, (ground - eyeY) / t)
  }
  if (steepest === -Infinity) return 1
  const hidden = eyeY + steepest * distance
  return Math.min(1, Math.max(0, (baseHeight + height - hidden) / height))
}

/** m, local frame → world, for a model at (x, y, z) turned by `yaw`. */
function toWorld(
  site: { x: number; y: number; z: number; yaw: number },
  right: number,
  up: number,
  forward: number,
): [number, number, number] {
  const [fx, fz] = bearingVector(site.yaw)
  // Right is forward turned 90° clockwise seen from above: (-fz, fx).
  return [site.x - fz * right + fx * forward, site.y + up, site.z + fx * right + fz * forward]
}

/** Arch opening, in the arch's local frame. Shared with `models/arch.ts`. */
export const ARCH_OPENING = {
  /** m, clear width between the legs at the ground */
  span: 100,
  /** m, clear height under the crown */
  clearance: 82,
} as const

/** Waterfall cliff, in its local frame. Shared with `models/waterfall.ts`. */
export const WATERFALL_CLIFF = {
  /** m, cliff top above the landmark's origin */
  height: 90,
  /** m, width of the falling ribbon */
  ribbonWidth: 18,
} as const

function landmarkFrom(
  spec: LandmarkSpec,
  station: LandmarkStation,
  route: Route,
  terrain: TerrainConfig,
  config: LandmarkConfig,
): Landmark {
  const { x, z } = stationPosition(station, route)
  const survey = surveyFootprint(x, z, spec.footprintRadius, terrain, config)
  const y = survey.center
  const relief = Math.max(0, y - survey.min)
  const footprints: Footprint[] = [{ x, z, radius: spec.footprintRadius }]
  // Seen from the reveal, the player meets each landmark's same side as when they were placed
  // round spawn (#76): the model's front faces on, away from them.
  const reveal = route.pointAt(station.s - config.revealDistance)
  let yaw = bearingTo(reveal.x, reveal.z, x, z)
  let trigger: TriggerVolume = {
    shape: 'sphere',
    center: [x, y + spec.height * 0.5, z],
    radius: spec.height * 0.75,
  }
  let soundAnchor: [number, number, number] = [x, y + spec.height * 0.5, z]
  let plungeDistance: number | undefined

  switch (spec.kind) {
    case 'arch': {
      // Square across the route: seen head-on down the valley, and flown through by flying it.
      const tangent = route.tangentAt(station.s)
      yaw = Math.atan2(-tangent.x, -tangent.z)
      const center = toWorld({ x, y, z, yaw }, 0, ARCH_OPENING.clearance * 0.5, 0)
      trigger = {
        shape: 'box',
        center,
        halfExtents: [ARCH_OPENING.span * 0.4, ARCH_OPENING.clearance * 0.45, 12],
        yaw,
      }
      soundAnchor = center
      break
    }
    case 'waterfall': {
      yaw = waterfallYaw(route)
      plungeDistance = plungeDistanceAlong(x, z, yaw, terrain, config) ?? config.waterfallShoreMin
      // The fall drops `height` from the cliff top at the plunge distance, into the pool.
      const [px, py, pz] = toWorld({ x, y, z, yaw }, 0, 0, plungeDistance)
      const midFall = (y + WATERFALL_CLIFF.height + terrain.waterLevel) * 0.5 - py
      soundAnchor = [px, py + midFall, pz]
      trigger = { shape: 'sphere', center: soundAnchor, radius: WATERFALL_CLIFF.height }
      // The plunge pool is water, but spray and mist belong to the landmark.
      footprints.push({ x: px, z: pz, radius: 30 })
      break
    }
    case 'tower':
      soundAnchor = [x, y + spec.height * 0.6, z]
      break
    default:
      break
  }
  return {
    kind: spec.kind,
    x,
    y,
    z,
    yaw,
    station: station.s,
    lateral: station.lateral,
    relief,
    height: spec.height,
    footprints,
    trigger,
    soundAnchor,
    ...(plungeDistance === undefined ? {} : { plungeDistance }),
  }
}

/**
 * Places every landmark at its station in `LANDMARK_STATIONS`. Deterministic: same terrain seed,
 * route and config, same answer.
 */
export function placeLandmarks(
  terrain: TerrainConfig = TERRAIN_CONFIG,
  config: LandmarkConfig = LANDMARK_CONFIG,
  route: Route = ROUTE,
): Landmark[] {
  return config.specs.map((spec) =>
    landmarkFrom(spec, stationFor(spec.kind), route, terrain, config),
  )
}

let cachedLandmarks: readonly Landmark[] | null = null

/**
 * The landmarks for the fixed world seed. Placed once, on first use, and cached: the seed never
 * changes. Foliage, the golden path and audio read the same list.
 */
export function getLandmarks(): readonly Landmark[] {
  cachedLandmarks ??= placeLandmarks()
  return cachedLandmarks
}

/** True if (x, z) is inside any landmark footprint, grown by `margin` m. For foliage (A3). */
export function insideLandmarkFootprint(
  x: number,
  z: number,
  landmarks: readonly Landmark[] = getLandmarks(),
  margin = 0,
): boolean {
  for (const landmark of landmarks) {
    for (const footprint of landmark.footprints) {
      const r = footprint.radius + margin
      const dx = x - footprint.x
      const dz = z - footprint.z
      if (dx * dx + dz * dz < r * r) return true
    }
  }
  return false
}

/** True if a world point is inside a trigger volume. */
export function insideTrigger(
  trigger: TriggerVolume,
  point: readonly [number, number, number],
): boolean {
  const dx = point[0] - trigger.center[0]
  const dy = point[1] - trigger.center[1]
  const dz = point[2] - trigger.center[2]
  if (trigger.shape === 'sphere') {
    return dx * dx + dy * dy + dz * dz < trigger.radius * trigger.radius
  }
  const [fx, fz] = bearingVector(trigger.yaw)
  const forward = dx * fx + dz * fz
  const right = -dx * fz + dz * fx
  const [hr, hu, hf] = trigger.halfExtents
  return Math.abs(right) < hr && Math.abs(dy) < hu && Math.abs(forward) < hf
}

export interface PassBy {
  /** m, from the listener to the landmark's sound anchor */
  distance: number
  /**
   * m/s, how fast that distance is shrinking (negative once past). The doppler factor for a
   * source at rest is `(c + closingSpeed) / c`, with c the speed of sound.
   */
  closingSpeed: number
}

/**
 * Doppler hook for F3: distance to a landmark's sound anchor and the closing speed along the line
 * to it, for a listener at `position` moving at `velocity` (m/s).
 */
export function landmarkPassBy(
  landmark: Pick<Landmark, 'soundAnchor'>,
  position: readonly [number, number, number],
  velocity: readonly [number, number, number],
): PassBy {
  const dx = landmark.soundAnchor[0] - position[0]
  const dy = landmark.soundAnchor[1] - position[1]
  const dz = landmark.soundAnchor[2] - position[2]
  const distance = Math.hypot(dx, dy, dz)
  if (distance < 1e-6) return { distance: 0, closingSpeed: 0 }
  const closingSpeed = (velocity[0] * dx + velocity[1] * dy + velocity[2] * dz) / distance
  return { distance, closingSpeed }
}

/**
 * GLSL-mirror of the landmark haze: the far layer as the terrain has it, capped at `hazeCap` so a
 * landmark stays a readable cutout, then released to 100% between `far` and `far × hazeRelease`
 * so it fades out before the camera's far plane clips it.
 */
export function landmarkFarHaze(
  distance: number,
  near: number,
  far: number,
  config: Pick<LandmarkConfig, 'hazeCap' | 'hazeRelease'> = LANDMARK_CONFIG,
): number {
  const smoothstep = (e0: number, e1: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
  }
  const capped = Math.min(smoothstep(near, far, distance), config.hazeCap)
  const release = smoothstep(far, far * config.hazeRelease, distance)
  return capped + (1 - capped) * release
}
