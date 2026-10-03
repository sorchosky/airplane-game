import type { NoiseFunction4D } from 'simplex-noise'

// Seamlessly repeating noise for the wrapping world (#176). Pure: no React or Three.
//
// How it works, in plain terms: x is turned into an angle round one circle and z into an angle
// round a second circle, each going once round per `period` metres. The two circles together make
// a torus (a doughnut surface) that sits in 4D, and 4D simplex noise is sampled on it. Walking
// `period` metres along x comes back to the same 4D point, so the noise repeats exactly and has no
// seam. The torus is flat (a Clifford torus), so features keep their size in every direction: a
// circle of radius `period / (2π · scale)` noise units makes one metre of ground one `1 / scale`
// noise unit of arc, exactly what `noise2D(x / scale, z / scale)` saw (then `FEATURE_MATCH`
// evens out how much wider 4D simplex bumps are).
//
// 4D simplex noise is not spread like 2D simplex noise: it sits nearer zero more often. Each sample
// goes through `matchNoise2D`, a fixed transfer curve that maps 4D values to the 2D value at the
// same percentile, so every threshold the terrain was tuned on (peaks over 0.62, rivers at zero
// crossings, lakes, plateaus) keeps covering the same share of the world.

/** A world point as its two unit circles: (cos, sin) of the x angle, then of the z angle. */
export interface TorusPoint {
  cx: number
  sx: number
  cz: number
  sz: number
}

/** Fills `out` with the torus angles of world (x, z) for a world `period` m across. */
export function torusPoint(x: number, z: number, period: number, out: TorusPoint): TorusPoint {
  const ax = (2 * Math.PI * x) / period
  const az = (2 * Math.PI * z) / period
  out.cx = Math.cos(ax)
  out.sx = Math.sin(ax)
  out.cz = Math.cos(az)
  out.sz = Math.sin(az)
  return out
}

/**
 * 4D simplex noise's bumps are wider than 2D's at the same frequency (each corner's kernel reaches
 * further), so a 2D slice of it crosses zero about 15 % less often per metre. Sampling this much
 * faster brings zero crossings and slopes back to what the 2D noise had. Measured over 200 k pairs
 * at 180, 1300 and 2200 m feature sizes.
 */
export const FEATURE_MATCH = 1.18

/**
 * Noise units of 4D radius that give features `scale` m across in a world `period` m across: one
 * metre of ground is `FEATURE_MATCH / scale` noise units of arc.
 */
export function torusRadius(scale: number, period: number): number {
  return (FEATURE_MATCH * period) / (2 * Math.PI * scale)
}

// |4D value| at 0, 0.05, ... 1 → the 2D value at the same percentile. Measured from 2.4 M samples
// of each over 16 seeds at the radii the terrain uses; the top two knots are smoothed, since only
// 0.2% of samples land above 0.9.
const MATCH_KNOTS = [
  0, 0.125, 0.236, 0.332, 0.411, 0.473, 0.523, 0.564, 0.6, 0.629, 0.664, 0.706, 0.756, 0.801, 0.838,
  0.866, 0.888, 0.906, 0.928, 0.964, 1,
]
const MATCH_STEPS = MATCH_KNOTS.length - 1

/** Maps a 4D simplex value (-1..1) to the 2D simplex value at the same percentile. Odd, monotonic. */
export function matchNoise2D(value: number): number {
  const t = Math.min(Math.abs(value), 1) * MATCH_STEPS
  const k = Math.min(Math.floor(t), MATCH_STEPS - 1)
  const low = MATCH_KNOTS[k]!
  const mapped = low + (MATCH_KNOTS[k + 1]! - low) * (t - k)
  return value < 0 ? -mapped : mapped
}

// Centre of every torus in 4D. Off the noise lattice on purpose: a small torus round a lattice
// vertex (the origin is one) sees its symmetric neighbourhood and averages toward zero, which
// halved the spread of the broadest fields (the 11 km mountain-range mask has a 0.4 radius).
const CENTER_X = 0.618
const CENTER_Y = 0.309
const CENTER_Z = 0.437
const CENTER_W = 0.881

/**
 * Noise at a torus point, -1..1, on a circle of `radius` noise units. `offset` moves the circles'
 * centre in 4D, which gives an unrelated field from the same noise (the 2D code's `+ 17` trick).
 */
export function sampleTorus(
  noise: NoiseFunction4D,
  p: TorusPoint,
  radius: number,
  offset = 0,
): number {
  return matchNoise2D(
    noise(
      CENTER_X + offset + p.cx * radius,
      CENTER_Y + offset + p.sx * radius,
      CENTER_Z - offset + p.cz * radius,
      CENTER_W - offset + p.sz * radius,
    ),
  )
}

const scratch: TorusPoint = { cx: 1, sx: 0, cz: 1, sz: 0 }

/**
 * Seamless noise at world (x, z), -1..1, with features `scale` m across, repeating every `period`
 * m on both axes: `torusNoise(n, x + period, z, ...) == torusNoise(n, x, z, ...)`.
 */
export function torusNoise(
  noise: NoiseFunction4D,
  x: number,
  z: number,
  scale: number,
  period: number,
): number {
  return sampleTorus(noise, torusPoint(x, z, period, scratch), torusRadius(scale, period))
}

/**
 * The copy of `value` (adding whole periods) nearest `center`: the minimum image. Distances from
 * `center` to the result are the wrapped distances, never more than half a period.
 */
export function wrapNear(value: number, center: number, period: number): number {
  return value - period * Math.round((value - center) / period)
}

/** Positive modulo: `index` wrapped into 0..count-1, for lattices that repeat every `count` cells. */
export function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count
}
