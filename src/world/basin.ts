import type { BasinConfig, BasinNotch, CrestPoint } from './terrainConfig'

// Pure basin shape (#171). Pulls the noise terrain toward a designed profile around the spawn:
//   floor   a gentle slope from `floorCenterHeight` at the centre to `floorEdgeHeight` at
//           `clearRadius`
//   ridge   a ring rising from there to a crest at `ridgeRadius`, its height varying round the
//           ring between named peaks and saddles, plus a little of the terrain noise
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

const TURN = 360

interface CrestTable {
  /** The crest points sorted by bearing in 0..360 */
  readonly points: readonly CrestPoint[]
  /** Per whole degree of bearing, the index of the last point at or before it, or -1 */
  readonly before: Int8Array
}

// `applyBasin` runs per vertex, so the search for the two points either side is done once.
const crestTables = new WeakMap<BasinConfig, CrestTable>()

function crestTableOf(basin: BasinConfig): CrestTable {
  const cached = crestTables.get(basin)
  if (cached) return cached
  const points = basin.crestPoints
    .map((point) => ({ ...point, bearing: ((point.bearing % TURN) + TURN) % TURN }))
    .sort((a, b) => a.bearing - b.bearing)
  const before = new Int8Array(TURN)
  for (let degree = 0; degree < TURN; degree++) {
    let index = -1
    for (let i = 0; i < points.length; i++) if (points[i]!.bearing <= degree) index = i
    before[degree] = index
  }
  const table = { points, before }
  crestTables.set(basin, table)
  return table
}

/**
 * Crest shape (-1..1) at bearing `theta` (radians, clockwise from north): eased between the two
 * named points either side, flat at each, so every peak and saddle is an extreme and the ring is C1.
 */
export function crestShapeAt(theta: number, basin: BasinConfig): number {
  const { points, before } = crestTableOf(basin)
  const count = points.length
  if (count === 0) return 0
  if (count === 1) return points[0]!.shape
  const bearing = ((((theta * 180) / Math.PI) % TURN) + TURN) % TURN
  // The last point at or before `bearing`: the table's, or one later in the same degree. Before
  // the first point the segment wraps round from the last.
  let index = before[Math.floor(bearing) % TURN]!
  while (index + 1 < count && points[index + 1]!.bearing <= bearing) index++
  const a = points[(index + count) % count]!
  const b = points[(index + 1) % count]!
  const span = (b.bearing - a.bearing + TURN) % TURN || TURN
  const t = ((bearing - a.bearing + TURN) % TURN) / span
  return mix(a.shape, b.shape, t * t * (3 - 2 * t))
}

/** Crest height at bearing `theta`, from the named peaks and saddles. */
export function crestAt(theta: number, basin: BasinConfig): number {
  return basin.crestHeight * (1 + basin.crestVariation * crestShapeAt(theta, basin))
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

const noCrags = (): number => 0

/**
 * Basin height at (x, z), given the terrain's own `noiseHeight` there. Returns `noiseHeight`
 * unchanged beyond `blendRadius`. `crags` samples a ridged noise (0..1, 1 on a crest) for the rock
 * relief on the peaks; it is only called where a peak needs it.
 */
export function applyBasin(
  x: number,
  z: number,
  noiseHeight: number,
  basin: BasinConfig,
  crags: () => number = noCrags,
): number {
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
  // On the floor the crest doesn't count, so its lookup is skipped there.
  const shape = rise > 0 ? crestShapeAt(theta, basin) : 0
  const crest = rise > 0 ? basin.crestHeight * (1 + basin.crestVariation * shape) : 0
  // Crags: lift-only ridged rock on the peaks' upper slopes, none on the saddles, so a horn reads
  // as rock rather than a smooth dome.
  const cragWeight = rise * rise * smoothstep(0, 1, shape)
  const crag = cragWeight > 0 ? cragWeight * basin.cragHeight * crags() : 0
  const target =
    floor +
    (rise > 0 ? (crest - basin.floorEdgeHeight) * rise : 0) +
    crag +
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
