import { clamp } from '../input/clamp'
import { PLANE_DIMENSIONS } from './planeGeometry'

/**
 * Wingtip vortices (#71): a thin vapour ribbon trailing each wingtip in a hard turn or a fast
 * dive. Each tip keeps a ring buffer of world-space samples; every frame both ribbons are
 * rewritten, newest point first, into one position and one colour buffer that a single mesh
 * draws, so the effect is one draw call with a static index buffer. Pure: no React or renderer.
 */
export interface VortexParams {
  /** radians, |bank| above which the tips stream vapour. */
  bankThreshold: number
  /** m/s, airspeed above which the tips stream vapour whatever the bank. */
  speedThreshold: number
  /** s, how long a sample lives before it has faded out. */
  life: number
  /** s between recorded samples. The live tip is always the ribbon's first point. */
  sampleInterval: number
  /** m, ribbon width at birth; it spreads to `spread` times that as it dies. */
  width: number
  spread: number
  /** 0..1, alpha of a fresh sample. */
  opacity: number
  /**
   * m from the camera: clear inside `nearFadeStart`, full strength past `nearFadeEnd`. In a steady
   * banked turn the outer tip's trail passes within a metre or two of the chase camera, so it
   * must be gone well before it reaches the lens.
   */
  nearFadeStart: number
  nearFadeEnd: number
}

const degToRad = (degrees: number): number => (degrees * Math.PI) / 180

export const VORTEX_PARAMS: VortexParams = {
  bankThreshold: degToRad(25),
  speedThreshold: 52,
  life: 1.5,
  sampleInterval: 1 / 30,
  width: 0.22,
  spread: 2.5,
  opacity: 0.55,
  nearFadeStart: 5,
  nearFadeEnd: 15,
}

/** Recorded samples per tip: enough to cover `life` at `sampleInterval`, plus one to fade into. */
export function vortexCapacity(params: VortexParams = VORTEX_PARAMS): number {
  return Math.ceil(params.life / params.sampleInterval) + 1
}

/** Ribbon points per tip: the live tip plus every recorded sample. */
export function ribbonPoints(capacity: number): number {
  return capacity + 1
}

export function vortexEmitting(
  bank: number,
  speed: number,
  params: VortexParams = VORTEX_PARAMS,
): boolean {
  return Math.abs(bank) > params.bankThreshold || speed > params.speedThreshold
}

/**
 * Wingtip in the plane's local frame (m, nose toward -Z): the right tip for `side` 1, the left for
 * -1, just aft of the tip's quarter chord where the vortex rolls up.
 */
export function wingtipLocal(side: 1 | -1): [number, number, number] {
  const halfSpan = PLANE_DIMENSIONS.wingSpan / 2
  const y = PLANE_DIMENSIONS.wingY + halfSpan * Math.tan(PLANE_DIMENSIONS.dihedral)
  return [side * halfSpan, y, 0.3]
}

export interface VortexTrail {
  readonly capacity: number
  /** xyz per sample, ring-ordered. */
  readonly position: Float32Array
  /** Sim time each sample was recorded, s. */
  readonly time: Float32Array
  /** 1 if the tip was streaming when the sample was taken. */
  readonly on: Uint8Array
  /** Ring index of the newest sample. */
  head: number
  /** Samples recorded so far, up to `capacity`. */
  count: number
  /** Sim time of the newest sample, s. */
  lastTime: number
}

export function createVortexTrail(capacity: number = vortexCapacity()): VortexTrail {
  return {
    capacity,
    position: new Float32Array(capacity * 3),
    time: new Float32Array(capacity),
    on: new Uint8Array(capacity),
    head: -1,
    count: 0,
    lastTime: -Infinity,
  }
}

/** Forgets every sample (a respawn or reset must not draw a ribbon across the map). */
export function clearVortexTrail(trail: VortexTrail): void {
  trail.head = -1
  trail.count = 0
  trail.lastTime = -Infinity
}

/**
 * Records the tip at sim time `now` if `sampleInterval` has passed since the last sample. Samples
 * are kept while not streaming too (marked off) so a ribbon that stops fades from its tail rather
 * than being yanked to the wing.
 */
export function recordVortex(
  trail: VortexTrail,
  x: number,
  y: number,
  z: number,
  now: number,
  emitting: boolean,
  params: VortexParams = VORTEX_PARAMS,
): void {
  if (now - trail.lastTime < params.sampleInterval) return
  const i = (trail.head + 1) % trail.capacity
  trail.position[i * 3] = x
  trail.position[i * 3 + 1] = y
  trail.position[i * 3 + 2] = z
  trail.time[i] = now
  trail.on[i] = emitting ? 1 : 0
  trail.head = i
  trail.count = Math.min(trail.count + 1, trail.capacity)
  trail.lastTime = now
}

/** Alpha of a ribbon point `age` s old and `distance` m from the camera. */
export function vortexAlpha(
  age: number,
  distance: number,
  params: VortexParams = VORTEX_PARAMS,
): number {
  const life = 1 - clamp(age / params.life, 0, 1)
  const near = clamp(
    (distance - params.nearFadeStart) / (params.nearFadeEnd - params.nearFadeStart),
    0,
    1,
  )
  return params.opacity * life * life * near
}

// Ribbon point scratch: world position, age and on flag of point k, filled by `pointAt`.
const pointScratch = { x: 0, y: 0, z: 0, age: 0, on: false }

/**
 * Point `k` of the ribbon: 0 is the live tip, 1.. are samples newest to oldest. Points past the
 * recorded count report an infinite age; `writeRibbon` collapses them, and any expired sample,
 * onto the last live point.
 */
function pointAt(
  trail: VortexTrail,
  k: number,
  tipX: number,
  tipY: number,
  tipZ: number,
  tipOn: boolean,
  now: number,
): typeof pointScratch {
  const p = pointScratch
  if (k === 0 || trail.count === 0) {
    p.x = tipX
    p.y = tipY
    p.z = tipZ
    p.age = k === 0 ? 0 : Infinity
    p.on = k === 0 && tipOn
    return p
  }
  const back = Math.min(k, trail.count) - 1
  const i = (trail.head - back + trail.capacity) % trail.capacity
  p.x = trail.position[i * 3] ?? 0
  p.y = trail.position[i * 3 + 1] ?? 0
  p.z = trail.position[i * 3 + 2] ?? 0
  p.age = k > trail.count ? Infinity : now - (trail.time[i] ?? 0)
  p.on = k <= trail.count && trail.on[i] === 1
  return p
}

/** Distance from point `p` to the segment `a`–`b`, m. */
export function segmentDistance(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  px: number,
  py: number,
  pz: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const lengthSq = dx * dx + dy * dy + dz * dz
  const t =
    lengthSq > 0 ? clamp(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lengthSq, 0, 1) : 0
  return Math.hypot(ax + dx * t - px, ay + dy * t - py, az + dz * t - pz)
}

/**
 * Writes one ribbon, two vertices per point, into `positions` (xyz) and the alpha channel of
 * `colors` (rgba), starting at vertex `firstVertex`. The ribbon faces the camera: each pair is
 * spread across the trail, perpendicular to both the trail and the line of sight. A point's
 * alpha is zero if the tip wasn't streaming when it was recorded, if it has outlived `life`, or
 * if it is right in front of the lens.
 */
export function writeRibbon(
  trail: VortexTrail,
  tipX: number,
  tipY: number,
  tipZ: number,
  tipOn: boolean,
  now: number,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  positions: Float32Array,
  colors: Float32Array,
  firstVertex: number,
  params: VortexParams = VORTEX_PARAMS,
): void {
  const points = ribbonPoints(trail.capacity)
  // Neighbouring points, for the trail's direction at each point. Read before the scratch is
  // overwritten by the next `pointAt`.
  let prevX = 0
  let prevY = 0
  let prevZ = 0
  let x = 0
  let y = 0
  let z = 0
  let age = 0
  let on = false
  let ended = false
  for (let k = 0; k < points; k++) {
    if (k === 0) {
      const p = pointAt(trail, 0, tipX, tipY, tipZ, tipOn, now)
      x = p.x
      y = p.y
      z = p.z
      age = p.age
      on = p.on
      prevX = x
      prevY = y
      prevZ = z
    }
    // The next point along the trail (older), or this one at the end.
    const next = k + 1 < points ? pointAt(trail, k + 1, tipX, tipY, tipZ, tipOn, now) : null
    // The ribbon ends at the first point past its life (or never recorded), or whose segment from
    // this point passes inside `nearFadeStart` of the camera, and every point after that collapses
    // onto the last live one. Fading alpha alone isn't enough: a transparent vertex kilometres back
    // from an earlier burst, or a metre from the lens, still stretches its quads across the screen
    // as a faint wedge. The chase camera sits where the outer tip was a moment ago in a turn, so
    // at a low frame rate one long segment can run straight through it.
    if (
      !ended &&
      (next === null ||
        next.age >= params.life ||
        segmentDistance(x, y, z, next.x, next.y, next.z, cameraX, cameraY, cameraZ) <
          params.nearFadeStart)
    ) {
      ended = true
    }
    const alive = !ended && next !== null
    const nextX = alive ? next.x : x
    const nextY = alive ? next.y : y
    const nextZ = alive ? next.z : z
    const nextAge: number = alive ? next.age : Infinity
    const nextOn: boolean = alive ? next.on : false

    // Trail direction (central difference) crossed with the view direction gives the spread.
    const tx = prevX - nextX
    const ty = prevY - nextY
    const tz = prevZ - nextZ
    const vx = cameraX - x
    const vy = cameraY - y
    const vz = cameraZ - z
    let sx = ty * vz - tz * vy
    let sy = tz * vx - tx * vz
    let sz = tx * vy - ty * vx
    const sLength = Math.hypot(sx, sy, sz)
    if (sLength < 1e-6) {
      sx = 0
      sy = 1
      sz = 0
    } else {
      sx /= sLength
      sy /= sLength
      sz /= sLength
    }
    const ageFraction = Number.isFinite(age) ? clamp(age / params.life, 0, 1) : 1
    const half = 0.5 * params.width * (1 + (params.spread - 1) * ageFraction)
    const distance = Math.hypot(vx, vy, vz)
    const alpha = on && Number.isFinite(age) ? vortexAlpha(age, distance, params) : 0

    const v = firstVertex + k * 2
    positions[v * 3] = x - sx * half
    positions[v * 3 + 1] = y - sy * half
    positions[v * 3 + 2] = z - sz * half
    positions[v * 3 + 3] = x + sx * half
    positions[v * 3 + 4] = y + sy * half
    positions[v * 3 + 5] = z + sz * half
    colors[v * 4 + 3] = alpha
    colors[v * 4 + 7] = alpha

    prevX = x
    prevY = y
    prevZ = z
    x = nextX
    y = nextY
    z = nextZ
    age = nextAge
    on = nextOn
  }
}

/**
 * Static triangle indices for `ribbons` ribbons of `points` points each, laid out one after the
 * other: a quad between every pair of neighbouring points, none across ribbons.
 */
export function buildRibbonIndex(ribbons: number, points: number): Uint16Array {
  const quads = ribbons * (points - 1)
  const index = new Uint16Array(quads * 6)
  let n = 0
  for (let r = 0; r < ribbons; r++) {
    for (let k = 0; k < points - 1; k++) {
      const a = (r * points + k) * 2
      index[n++] = a
      index[n++] = a + 1
      index[n++] = a + 2
      index[n++] = a + 1
      index[n++] = a + 3
      index[n++] = a + 2
    }
  }
  return index
}
