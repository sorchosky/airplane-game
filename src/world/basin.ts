import type { BasinConfig, BasinNotch } from './terrainConfig'

// Pure basin shape (#171). Pulls the noise terrain toward a designed profile around the spawn:
//   floor   a gentle slope from `floorCenterHeight` at the centre to `floorEdgeHeight` at
//           `clearRadius`
//   ridge   a ring rising from there to a crest at `ridgeRadius`, its height varying round the
//           ring by a few low harmonics and a little of the terrain noise (never a perfect circle)
//   notches two gaps along rays from the centre, each with a flat floor and smooth flanks
// Every blend is a smoothstep of a distance, so the surface is C1.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t

/** Smooth, bounded -1..1 stand-in for "how far this noise height is from a typical hill". */
const wobbleOf = (noiseHeight: number): number => Math.tanh((noiseHeight - 60) / 60)

/** m, distance from the basin centre to a notch's route point */
export function notchRadius(basin: BasinConfig, notch: BasinNotch): number {
  return Math.hypot(notch.x - basin.centerX, notch.z - basin.centerZ)
}

/** Mean-free crest height at bearing `theta`, from two fixed harmonics. */
export function crestAt(theta: number, basin: BasinConfig): number {
  const harmonics = 0.6 * Math.sin(3 * theta + 0.7) + 0.4 * Math.sin(5 * theta + 2.1)
  return basin.crestHeight * (1 + basin.crestVariation * harmonics)
}

/** Floor height with no noise, at radius `r`. */
export function floorAt(r: number, basin: BasinConfig): number {
  return mix(basin.floorCenterHeight, basin.floorEdgeHeight, smoothstep(0, basin.clearRadius, r))
}

interface PreparedNotch {
  notch: BasinNotch
  /** m, distance from the centre to the route point */
  radius: number
  /** unit vector from the centre toward the route point */
  ux: number
  uz: number
}

interface Prepared {
  /** m squared, beyond this radius from the centre nothing is changed */
  outerSquared: number
  notches: readonly PreparedNotch[]
}

// `heightAt` runs ~300k times per tile ring, so the per-basin geometry is worked out once.
const prepared = new WeakMap<BasinConfig, Prepared>()

function prepare(basin: BasinConfig): Prepared {
  const cached = prepared.get(basin)
  if (cached) return cached
  const notches = basin.notches.map((notch) => {
    const radius = notchRadius(basin, notch)
    return {
      notch,
      radius,
      ux: (notch.x - basin.centerX) / radius,
      uz: (notch.z - basin.centerZ) / radius,
    }
  })
  let outer = basin.blendRadius
  for (const { notch, radius } of notches) {
    outer = Math.max(outer, radius + notch.extension)
  }
  // The notch corridors only reach their flanks near the centre line, but a square of this
  // radius is a safe, cheap bound.
  const result = { outerSquared: (outer + 1) ** 2, notches }
  prepared.set(basin, result)
  return result
}

/**
 * Basin height at (x, z), given the terrain's own `noiseHeight` there. Returns `noiseHeight`
 * unchanged beyond `blendRadius`.
 */
export function applyBasin(x: number, z: number, noiseHeight: number, basin: BasinConfig): number {
  const dx = x - basin.centerX
  const dz = z - basin.centerZ
  const rSquared = dx * dx + dz * dz
  const { outerSquared, notches } = prepare(basin)
  if (rSquared >= outerSquared) return noiseHeight

  const r = Math.sqrt(rSquared)
  const theta = Math.atan2(dx, -dz)
  const wobble = wobbleOf(noiseHeight)

  // Ring: floor, rising to the crest and holding it, then fading back into the noise.
  const rise = smoothstep(basin.clearRadius, basin.ridgeRadius, r)
  const floor = floorAt(r, basin)
  const crest = crestAt(theta, basin)
  const target =
    floor +
    (crest - basin.floorEdgeHeight) * rise +
    wobble * mix(basin.floorNoise, basin.ridgeNoise, rise)
  const weight = 1 - smoothstep(basin.ridgeRadius + 100, basin.blendRadius, r)
  let height = mix(noiseHeight, target, weight)

  // Notches: flat floor, flanks easing back to the ring.
  for (const { notch, radius, ux, uz } of notches) {
    const lateral = Math.abs(dx * uz - dz * ux)
    if (lateral >= notch.halfWidth + notch.flank) continue
    const across = 1 - smoothstep(notch.halfWidth, notch.halfWidth + notch.flank, lateral)
    const along = dx * ux + dz * uz
    const start = smoothstep(basin.clearRadius - 100, basin.clearRadius, along)
    const end = 1 - smoothstep(radius + notch.extension * 0.3, radius + notch.extension, along)
    const reachWeight = across * start * end
    if (reachWeight <= 0) continue
    const notchFloor = mix(
      basin.floorEdgeHeight,
      notch.floorHeight,
      smoothstep(basin.clearRadius, radius, along),
    )
    height = mix(height, notchFloor, reachWeight)
  }
  return height
}
