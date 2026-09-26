import { findSpawnPoint, heightAt, type SpawnPoint } from './heightfield'
import { TERRAIN_CONFIG, type TerrainConfig } from './terrainConfig'

// Landmarks (#76): five authored silhouettes placed on the horizon around spawn, so the world has
// places. This module is the pure half: where each one stands, its footprint (for foliage to
// keep clear of), its trigger volume (for the golden path, X4) and its sound anchor (for doppler,
// F3). No React or Three; the meshes are built in `models/` and drawn by `Landmarks.tsx`.
//
// Placement is a deterministic search. Each landmark has a preferred bearing and distance from
// spawn; the search walks a window of bearings and distances around them and keeps the best
// candidate whose footprint is on land, above the water and gentler than `maxSlopeDegrees`. The
// bearings are spread round the compass so every direction out of spawn has something on it.
//
// Bearings use the flight model's heading convention: bearing `b` points along
// (-sin b, 0, -cos b), so a plane with `heading = b` flies straight at it. 0 is -Z, the direction
// the plane faces at spawn.

export type LandmarkKind = 'tower' | 'arch' | 'waterfall' | 'tree' | 'ruins'

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
   * Radians. The model's local -Z (its front) points along (-sin yaw, 0, -cos yaw). The arch faces
   * spawn so its opening is on the way out; the waterfall faces its lake.
   */
  yaw: number
  /** Radians, bearing from spawn, and distance from spawn in m. */
  bearing: number
  distance: number
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
  /** degrees, preferred bearing from spawn */
  bearingDegrees: number
  /** degrees either side of the preferred bearing the search may move */
  bearingWindowDegrees: number
  /** m, distance range from spawn */
  minDistance: number
  maxDistance: number
  /** m, radius of ground the landmark stands on (every sample must pass the placement rules) */
  footprintRadius: number
  /** m, silhouette height above its base */
  height: number
  /**
   * How the search ranks candidates that pass: `high` prefers higher ground (a tower on a rise),
   * `low` prefers lower ground (an arch in a valley you can fly through), `flat` prefers the
   * gentlest footprint.
   */
  prefer: 'high' | 'low' | 'flat'
}

export interface LandmarkConfig {
  /** degrees, the steepest ground a footprint may stand on */
  maxSlopeDegrees: number
  /** m, the lowest ground may be above `waterLevel` (keeps landmarks off beaches) */
  minHeightAboveWater: number
  /** m, search step along the distance range */
  distanceStep: number
  /** degrees, search step across the bearing window */
  bearingStepDegrees: number
  /** Samples round each footprint ring, plus its centre. */
  footprintSamples: number
  /** m, how far the slope is measured across (larger = ignores small bumps) */
  slopeProbe: number
  /** m above spawn ground the sightline starts: the spawn altitude */
  spawnEyeHeight: number
  /** 0..1, how much of a landmark's height must clear the terrain in the sightline from spawn */
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
  distanceStep: 150,
  bearingStepDegrees: 4,
  footprintSamples: 12,
  slopeProbe: 12,
  spawnEyeHeight: 120,
  minVisibleFraction: 0.5,
  waterfallShoreMin: 40,
  waterfallShoreMax: 90,
  waterfallPlungeDepth: 2,
  hazeCap: 0.85,
  hazeRelease: 1.2,
  specs: [
    {
      kind: 'tower',
      bearingDegrees: -20,
      bearingWindowDegrees: 12,
      minDistance: 2500,
      maxDistance: 5000,
      footprintRadius: 30,
      height: 210,
      prefer: 'high',
    },
    {
      kind: 'arch',
      bearingDegrees: 50,
      bearingWindowDegrees: 25,
      minDistance: 2000,
      maxDistance: 4000,
      footprintRadius: 70,
      height: 120,
      prefer: 'low',
    },
    {
      kind: 'waterfall',
      bearingDegrees: 120,
      bearingWindowDegrees: 35,
      minDistance: 2000,
      maxDistance: 5000,
      footprintRadius: 25,
      height: 90,
      prefer: 'high',
    },
    {
      kind: 'tree',
      bearingDegrees: 190,
      bearingWindowDegrees: 25,
      minDistance: 2000,
      maxDistance: 4000,
      footprintRadius: 35,
      height: 120,
      prefer: 'high',
    },
    {
      kind: 'ruins',
      bearingDegrees: 270,
      bearingWindowDegrees: 30,
      minDistance: 2000,
      maxDistance: 4500,
      footprintRadius: 110,
      height: 60,
      prefer: 'flat',
    },
  ],
}

const deg = (degrees: number): number => (degrees * Math.PI) / 180

/** Forward vector of a heading/bearing, in the flight model's convention. */
export function bearingVector(bearing: number): [number, number] {
  return [-Math.sin(bearing), -Math.cos(bearing)]
}

/** Bearing from (fromX, fromZ) to (toX, toZ): the heading that flies straight at it. */
export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ))
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
 * Waterfall only: the direction from (x, z) toward the nearest deep-enough water between
 * `waterfallShoreMin` and `waterfallShoreMax`, or null if there is none. The cliff's front faces
 * that way and the fall plunges into it.
 */
export function findPlunge(
  x: number,
  z: number,
  terrain: TerrainConfig = TERRAIN_CONFIG,
  config: LandmarkConfig = LANDMARK_CONFIG,
): { yaw: number; distance: number } | null {
  const plungeHeight = terrain.waterLevel - config.waterfallPlungeDepth
  for (let d = config.waterfallShoreMin; d <= config.waterfallShoreMax; d += 10) {
    for (let i = 0; i < 24; i++) {
      const yaw = (i / 24) * Math.PI * 2
      const [fx, fz] = bearingVector(yaw)
      // The plunge pool and a little past it must both be water, so the fall lands in a lake,
      // not on the lip of a puddle.
      if (
        heightAt(x + fx * d, z + fz * d, terrain) < plungeHeight &&
        heightAt(x + fx * (d + 30), z + fz * (d + 30), terrain) < plungeHeight
      ) {
        return { yaw, distance: d }
      }
    }
  }
  return null
}

/**
 * 0..1, how much of a landmark `height` m tall standing on ground `baseHeight` at (x, z) shows over
 * the terrain from the spawn eye. Walks the sightline and finds the steepest terrain elevation
 * angle; the part of the landmark above that line is visible.
 */
export function visibleFractionFromSpawn(
  x: number,
  z: number,
  baseHeight: number,
  height: number,
  spawn: SpawnPoint,
  terrain: TerrainConfig = TERRAIN_CONFIG,
  config: LandmarkConfig = LANDMARK_CONFIG,
): number {
  const eye = spawn.groundHeight + config.spawnEyeHeight
  const distance = Math.hypot(x - spawn.x, z - spawn.z)
  const steps = Math.max(1, Math.floor(distance / 100))
  let steepest = -Infinity
  // Stop short of the landmark's own footprint so its own hill doesn't block it.
  for (let i = 1; i < steps - 1; i++) {
    const t = i / steps
    const ground = Math.max(
      heightAt(spawn.x + (x - spawn.x) * t, spawn.z + (z - spawn.z) * t, terrain),
      terrain.waterLevel,
    )
    steepest = Math.max(steepest, (ground - eye) / (distance * t))
  }
  const hidden = eye + steepest * distance
  return Math.min(1, Math.max(0, (baseHeight + height - hidden) / height))
}

interface Candidate {
  x: number
  z: number
  bearing: number
  distance: number
  survey: FootprintSurvey
  score: number
  plunge: { yaw: number; distance: number } | null
}

function scoreCandidate(spec: LandmarkSpec, survey: FootprintSurvey, offBearing: number): number {
  // Staying near the preferred bearing keeps the landmarks spread round the compass.
  const bearingPenalty = offBearing * 40
  const relief = survey.max - survey.min
  switch (spec.prefer) {
    case 'high':
      return survey.center - relief * 0.5 - bearingPenalty
    case 'low':
      return -survey.center - relief * 0.5 - bearingPenalty
    case 'flat':
      return -relief * 2 - survey.maxSlope - bearingPenalty
  }
}

function searchSite(
  spec: LandmarkSpec,
  spawn: SpawnPoint,
  terrain: TerrainConfig,
  config: LandmarkConfig,
): Candidate | null {
  let best: Candidate | null = null
  const window = spec.bearingWindowDegrees
  for (let offset = -window; offset <= window; offset += config.bearingStepDegrees) {
    const bearing = deg(spec.bearingDegrees + offset)
    const [fx, fz] = bearingVector(bearing)
    for (let d = spec.minDistance; d <= spec.maxDistance; d += config.distanceStep) {
      const x = spawn.x + fx * d
      const z = spawn.z + fz * d
      // Cheap reject before the full survey: the centre alone must be dry, gentle ground.
      const centre = heightAt(x, z, terrain)
      if (centre < terrain.waterLevel + config.minHeightAboveWater) continue
      if (slopeDegreesAt(x, z, terrain, config.slopeProbe) >= config.maxSlopeDegrees) continue
      const plunge = spec.kind === 'waterfall' ? findPlunge(x, z, terrain, config) : null
      if (spec.kind === 'waterfall' && !plunge) continue
      const survey = surveyFootprint(x, z, spec.footprintRadius, terrain, config)
      if (!survey.ok) continue
      const visible = visibleFractionFromSpawn(
        x,
        z,
        survey.center,
        spec.height,
        spawn,
        terrain,
        config,
      )
      if (visible < config.minVisibleFraction) continue
      // A waterfall wants its lake close under the lip, so the stack stays a cliff, not a mesa.
      const score =
        scoreCandidate(spec, survey, Math.abs(offset) / Math.max(window, 1)) -
        (plunge ? plunge.distance * 2 : 0)
      if (!best || score > best.score) {
        best = { x, z, bearing, distance: d, survey, score, plunge }
      }
    }
  }
  return best
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
  site: Candidate,
  terrain: TerrainConfig,
  config: LandmarkConfig,
): Landmark {
  const { x, z, bearing, distance, survey } = site
  const y = survey.center
  const relief = Math.max(0, y - survey.min)
  const footprints: Footprint[] = [{ x, z, radius: spec.footprintRadius }]
  let yaw = bearing
  let trigger: TriggerVolume = {
    shape: 'sphere',
    center: [x, y + spec.height * 0.5, z],
    radius: spec.height * 0.75,
  }
  let soundAnchor: [number, number, number] = [x, y + spec.height * 0.5, z]
  let plungeDistance: number | undefined

  switch (spec.kind) {
    case 'arch': {
      // The opening faces spawn: seen head-on on the way out, and flown through by heading out.
      yaw = bearing
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
      const plunge = site.plunge ?? { yaw: bearing, distance: config.waterfallShoreMin }
      yaw = plunge.yaw
      plungeDistance = plunge.distance
      // The fall drops `height` from the cliff top at the plunge distance, into the lake.
      const [px, py, pz] = toWorld({ x, y, z, yaw }, 0, 0, plunge.distance)
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
    bearing,
    distance,
    relief,
    height: spec.height,
    footprints,
    trigger,
    soundAnchor,
    ...(plungeDistance === undefined ? {} : { plungeDistance }),
  }
}

/**
 * Places every landmark for a world. Deterministic: same terrain seed and config, same answer.
 * Landmarks whose search finds no valid ground are left out rather than forced onto bad ground.
 */
export function placeLandmarks(
  terrain: TerrainConfig = TERRAIN_CONFIG,
  config: LandmarkConfig = LANDMARK_CONFIG,
  spawn: SpawnPoint = findSpawnPoint(terrain),
): Landmark[] {
  const placed: Landmark[] = []
  for (const spec of config.specs) {
    const site = searchSite(spec, spawn, terrain, config)
    if (site) placed.push(landmarkFrom(spec, site, terrain, config))
  }
  return placed
}

let cachedLandmarks: readonly Landmark[] | null = null

/**
 * The landmarks for the fixed world seed. Searched once, on first use (tens of ms), and cached:
 * the seed never changes. Foliage, the golden path and audio read the same list.
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
