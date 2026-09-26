// Pure cloud shape, layout and fly-through math (#70). No React or Three. `Clouds.tsx` turns these
// into two instanced draws: the mid-layer cumulus heaps and the high stratus billboards.
//
// How a cumulus is built, in plain terms:
// - One "heap" mesh is shared by every puff. It is lofted: a stack of rings around a vertical
//   axis, wide near the bottom and closing to a lumpy dome, with a flat disc for a base. That
//   flat base is what makes a cumulus read as a cumulus from below instead of a ball.
// - Each puff is that heap stretched, squashed and turned (its instance matrix), so the few
//   hundred puffs don't look stamped out of one mould.

import { mulberry32 } from './atmosphere'

/** Points around each ring of the heap. */
export const HEAP_SEGMENTS = 16

/**
 * The heap's lofted profile, bottom to top: `[height, radius]` in unit space (base radius about
 * 1, top at height 1). The ring just above the base bulges out past it, so the base tucks under
 * like the rounded lip of a real cumulus; the upper rings close into a broad, rounded dome.
 */
export const HEAP_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0.88],
  [0.12, 1],
  [0.4, 0.95],
  [0.66, 0.78],
  [0.87, 0.48],
]

/** Triangles in one heap: quads between rings, a fan to the top, a fan for the flat base. */
export const HEAP_TRIANGLES = (HEAP_PROFILE.length - 1) * HEAP_SEGMENTS * 2 + HEAP_SEGMENTS * 2

export interface HeapGeometry {
  positions: Float32Array
  normals: Float32Array
  indices: Uint16Array
}

/**
 * Radius and height wobble at angle `angle` and profile height `t`: two lobes that twist as they
 * climb, so the silhouette is lumpy from every side, not a lathe-turned bowl.
 */
function lump(angle: number, t: number): { radius: number; height: number } {
  return {
    radius: 1 + 0.14 * Math.sin(3 * angle + 1.3 + 2 * t) + 0.08 * Math.sin(2 * angle + 0.4 - 3 * t),
    height: 1 + 0.14 * t * Math.sin(4 * angle + 2.1) + 0.08 * t * Math.sin(3 * angle + 0.7),
  }
}

/**
 * The shared cumulus heap, base at y = 0, triangles wound counter-clockwise from outside. Normals
 * are area-weighted vertex averages; the base disc has its own vertices, so the rim between side
 * and base stays a crisp edge and the whole underside takes the shade band.
 */
export function buildHeapGeometry(): HeapGeometry {
  const rings = HEAP_PROFILE.length
  const s = HEAP_SEGMENTS
  // Side rings, the apex, the base rim and the base centre.
  const vertexCount = rings * s + 1 + s + 1
  const positions = new Float32Array(vertexCount * 3)
  const indices = new Uint16Array(HEAP_TRIANGLES * 3)

  const put = (index: number, x: number, y: number, z: number) => {
    positions[index * 3] = x
    positions[index * 3 + 1] = y
    positions[index * 3 + 2] = z
  }

  // Angle runs counter-clockwise seen from above, so side quads wind counter-clockwise outside.
  for (let r = 0; r < rings; r++) {
    const [t, radius] = HEAP_PROFILE[r] ?? [0, 0]
    for (let i = 0; i < s; i++) {
      const angle = (i / s) * Math.PI * 2
      const wobble = lump(angle, t)
      const rr = radius * wobble.radius
      put(r * s + i, Math.cos(angle) * rr, t * wobble.height, -Math.sin(angle) * rr)
    }
  }
  const apex = rings * s
  put(apex, 0.04, 1, -0.03)
  const baseRim = apex + 1
  for (let i = 0; i < s; i++) {
    put(baseRim + i, positions[i * 3] ?? 0, 0, positions[i * 3 + 2] ?? 0)
  }
  const baseCentre = baseRim + s
  put(baseCentre, 0, 0, 0)

  let k = 0
  const tri = (a: number, b: number, c: number) => {
    indices[k++] = a
    indices[k++] = b
    indices[k++] = c
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let i = 0; i < s; i++) {
      const next = (i + 1) % s
      const a = r * s + i
      const b = r * s + next
      const c = (r + 1) * s + next
      const d = (r + 1) * s + i
      tri(a, b, c)
      tri(a, c, d)
    }
  }
  const top = (rings - 1) * s
  for (let i = 0; i < s; i++) tri(top + i, top + ((i + 1) % s), apex)
  for (let i = 0; i < s; i++) tri(baseCentre, baseRim + ((i + 1) % s), baseRim + i)

  return { positions, normals: vertexNormals(positions, indices), indices }
}

/** Area-weighted vertex normals: each face adds its un-normalised cross product to its corners. */
export function vertexNormals(positions: Float32Array, indices: Uint16Array): Float32Array {
  const normals = new Float32Array(positions.length)
  const p = (index: number, axis: number) => positions[index * 3 + axis] ?? 0
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] ?? 0
    const b = indices[f + 1] ?? 0
    const c = indices[f + 2] ?? 0
    const ux = p(b, 0) - p(a, 0)
    const uy = p(b, 1) - p(a, 1)
    const uz = p(b, 2) - p(a, 2)
    const vx = p(c, 0) - p(a, 0)
    const vy = p(c, 1) - p(a, 1)
    const vz = p(c, 2) - p(a, 2)
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const v of [a, b, c]) {
      normals[v * 3] = (normals[v * 3] ?? 0) + nx
      normals[v * 3 + 1] = (normals[v * 3 + 1] ?? 0) + ny
      normals[v * 3 + 2] = (normals[v * 3 + 2] ?? 0) + nz
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const length = Math.hypot(normals[v] ?? 0, normals[v + 1] ?? 0, normals[v + 2] ?? 0) || 1
    normals[v] = (normals[v] ?? 0) / length
    normals[v + 1] = (normals[v + 1] ?? 0) / length
    normals[v + 2] = (normals[v + 2] ?? 0) / length
  }
  return normals
}

// ---------------------------------------------------------------------------------------------
// Mid-layer cumulus layout

export interface CumulusConfig {
  seed: number
  /** Number of cloud clusters */
  clusters: number
  /** Heaps per cluster, inclusive range */
  puffsMin: number
  puffsMax: number
  /** m, cluster base altitude range. Every heap in a cluster sits on (nearly) the same base. */
  altitudeMin: number
  altitudeMax: number
  /** m, heap base radius range */
  puffRadiusMin: number
  puffRadiusMax: number
  /** m, how far heaps spread horizontally from their cluster centre */
  clusterSpread: number
  /**
   * m, edge of the square of sky the clusters live in, centred on the player. Clusters that
   * drift or get left past one edge reappear at the opposite one. Half of it must be past
   * `hazeFadeEnd` so the jump happens where clouds are already fully hazed into the sky.
   */
  fieldSize: number
  /** m/s, world-space wind on x and z */
  windX: number
  windZ: number
}

export const CUMULUS_CONFIG: CumulusConfig = {
  seed: 22,
  clusters: 48,
  puffsMin: 3,
  puffsMax: 6,
  altitudeMin: 320,
  altitudeMax: 460,
  puffRadiusMin: 45,
  puffRadiusMax: 115,
  clusterSpread: 150,
  fieldSize: 19000,
  windX: 6,
  windZ: 2.5,
}

export interface CumulusPuff {
  /** m, cluster centre in the un-wrapped world at time 0 */
  clusterX: number
  clusterZ: number
  /** m, heap base centre relative to its cluster centre, plus the base altitude in `y` */
  offsetX: number
  y: number
  offsetZ: number
  /** m, heap half-width along its local x; local z is `radius × stretch` */
  radius: number
  stretch: number
  /** m, heap height */
  height: number
  /** radians, turn about world +Y */
  yaw: number
}

/**
 * Deterministic cumulus heaps. Each cluster shares one flat base; the biggest, tallest heaps sit
 * near its middle and smaller ones taper toward its edges, so a cluster reads as one towering
 * cloud with a flat bottom, not a pile of balls.
 */
export function cumulusLayout(config: CumulusConfig): CumulusPuff[] {
  const random = mulberry32(config.seed)
  const between = (min: number, max: number) => min + (max - min) * random()
  const puffs: CumulusPuff[] = []
  for (let c = 0; c < config.clusters; c++) {
    const clusterX = between(-0.5, 0.5) * config.fieldSize
    const clusterZ = between(-0.5, 0.5) * config.fieldSize
    const altitude = between(config.altitudeMin, config.altitudeMax)
    const count = Math.floor(between(config.puffsMin, config.puffsMax + 1))
    for (let p = 0; p < count; p++) {
      const angle = between(0, Math.PI * 2)
      // The first heap is the cluster's core, right in the middle.
      const reach = p === 0 ? 0 : Math.sqrt(random()) * config.clusterSpread
      const centrality = 1 - reach / config.clusterSpread
      const radius =
        config.puffRadiusMin + (config.puffRadiusMax - config.puffRadiusMin) * centrality
      puffs.push({
        clusterX,
        clusterZ,
        offsetX: Math.cos(angle) * reach,
        // A few metres of jitter keeps the shared base from looking ruled.
        y: altitude + between(-4, 4),
        offsetZ: Math.sin(angle) * reach,
        radius,
        stretch: between(0.75, 1.25),
        height: radius * between(0.75, 0.95) * (0.7 + 0.4 * centrality),
        yaw: between(0, Math.PI * 2),
      })
    }
  }
  return puffs
}

/**
 * How deep a point sits inside a heap: 0 at its core, 1 at its surface, above 1 outside (and
 * `Infinity` below its flat base). `dx, dy, dz` are the point minus the heap's base centre, in m.
 * The heap is treated as a half-ellipsoid a little inside the mesh, so "inside" means visibly in.
 */
export function heapDepth(dx: number, dy: number, dz: number, puff: CumulusPuff): number {
  if (dy < 0) return Infinity
  const cos = Math.cos(puff.yaw)
  const sin = Math.sin(puff.yaw)
  // World offset into the heap's local frame (the inverse of its yaw).
  const lx = (cos * dx - sin * dz) / puff.radius
  const lz = (sin * dx + cos * dz) / (puff.radius * puff.stretch)
  const ly = dy / puff.height
  return Math.hypot(lx, ly, lz) / HEAP_INSIDE_SCALE
}

/** The heap mesh's dome is about this fraction of the bounding half-ellipsoid. */
export const HEAP_INSIDE_SCALE = 0.9

// ---------------------------------------------------------------------------------------------
// High stratus band

export interface StratusConfig {
  seed: number
  count: number
  /** m, altitude range: well above the cumulus tops and anything the plane can reach */
  altitudeMin: number
  altitudeMax: number
  /** m, billboard width range; height is `width × aspect` */
  widthMin: number
  widthMax: number
  aspectMin: number
  aspectMax: number
  /** m, same wrap window as the cumulus */
  fieldSize: number
  /** m/s: faster than the cumulus, so the layers part a little as the player watches */
  windX: number
  windZ: number
}

export const STRATUS_CONFIG: StratusConfig = {
  seed: 71,
  count: 96,
  altitudeMin: 1500,
  altitudeMax: 1900,
  widthMin: 600,
  widthMax: 1500,
  aspectMin: 0.14,
  aspectMax: 0.26,
  fieldSize: 19000,
  windX: 9,
  windZ: 3.5,
}

export interface StratusSheet {
  x: number
  y: number
  z: number
  width: number
  height: number
}

/** Deterministic stratus sheets, spread evenly across the wrap window. */
export function stratusLayout(config: StratusConfig): StratusSheet[] {
  const random = mulberry32(config.seed)
  const between = (min: number, max: number) => min + (max - min) * random()
  const sheets: StratusSheet[] = []
  for (let i = 0; i < config.count; i++) {
    const width = between(config.widthMin, config.widthMax)
    sheets.push({
      x: between(-0.5, 0.5) * config.fieldSize,
      y: between(config.altitudeMin, config.altitudeMax),
      z: between(-0.5, 0.5) * config.fieldSize,
      width,
      height: width * between(config.aspectMin, config.aspectMax),
    })
  }
  return sheets
}

// ---------------------------------------------------------------------------------------------
// Shading constants, shared with the shader in `cloudMaterial.ts`

/**
 * Sunlit cloud faces land on this multiple of `cloud-top` (linear, before tone mapping). ACES maps
 * 1.3 to about 0.8: near-white on screen, and under the bloom threshold, so clouds never bloom.
 */
export const CLOUD_LIT_GAIN = 1.3

/** Shaded faces land on this multiple of `cloud-shade`: lavender-grey, lit from the sky. */
export const CLOUD_SHADE_GAIN = 1.05

/**
 * The two-band ramp: a face's lightness is a blend of N·L and how much it faces up (tops bright,
 * undersides in shade), stepped at `threshold` with a soft edge of half-width `softness`.
 */
export const CLOUD_RAMP = {
  sunWeight: 0.6,
  upWeight: 0.4,
  threshold: 0.25,
  softness: 0.05,
  /** How far the silhouette edge lifts toward `cloud-top`, and over which 1 - N·V range. */
  fresnelStrength: 0.35,
  fresnelStart: 0.55,
  fresnelEnd: 1,
} as const

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * 0 (shade band) .. 1 (lit band) for a unit world normal `n` and unit sun direction `sun`. The
 * shader's twin of this lives in `cloudMaterial.ts` and must stay in step.
 */
export function cloudBand(
  n: readonly [number, number, number],
  sun: readonly [number, number, number],
): number {
  const nDotL = n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]
  const lightness = CLOUD_RAMP.sunWeight * nDotL + CLOUD_RAMP.upWeight * n[1]
  return smoothstep(
    CLOUD_RAMP.threshold - CLOUD_RAMP.softness,
    CLOUD_RAMP.threshold + CLOUD_RAMP.softness,
    lightness,
  )
}

// ---------------------------------------------------------------------------------------------
// Fly-through burst (`docs/art-bible.md` §7): screen veil and puffs pushed aside

export const CLOUD_BURST = {
  /** Peak veil opacity, in `cloud-top`. */
  veilPeak: 0.3,
  /** s, the veil's whole life, and how long of it is the rise. */
  veilDuration: 0.4,
  veilAttack: 0.05,
  /** How many of the nearest heaps get pushed aside. */
  pushedPuffs: 6,
  /** Push distance, as a fraction of each heap's radius. */
  pushFraction: 0.6,
  /** s: out over `pushOut`, held until `pushHold`, back by `pushReturn`. */
  pushOut: 0.4,
  pushHold: 1.2,
  pushReturn: 4,
  /** s, a new burst needs this long since the last one, so skimming an edge doesn't strobe. */
  cooldown: 1.5,
} as const

/** Veil opacity `age` seconds into a burst: a quick rise to the peak, then an eased fade. */
export function veilOpacity(age: number): number {
  const { veilPeak, veilDuration, veilAttack } = CLOUD_BURST
  if (age < 0 || age >= veilDuration) return 0
  if (age < veilAttack) return (veilPeak * age) / veilAttack
  const fall = (age - veilAttack) / (veilDuration - veilAttack)
  return veilPeak * (1 - fall) * (1 - fall)
}

/** 0..1, how far the pushed heaps are displaced `age` seconds into a burst. */
export function pushAmount(age: number): number {
  const { pushOut, pushHold, pushReturn } = CLOUD_BURST
  if (age <= 0 || age >= pushReturn) return 0
  if (age < pushOut) {
    const t = age / pushOut
    return 1 - (1 - t) ** 3
  }
  if (age < pushHold) return 1
  return 1 - smoothstep(pushHold, pushReturn, age)
}

/**
 * Keeps the `count` smallest `depth` values seen so far in `depths` (ascending) with their
 * `indices`. Allocation-free, for the per-frame scan over every heap. Returns how many slots are
 * filled.
 */
export function insertNearest(
  indices: Int32Array,
  depths: Float32Array,
  filled: number,
  index: number,
  depth: number,
): number {
  const capacity = indices.length
  if (filled === capacity && depth >= (depths[capacity - 1] ?? Infinity)) return filled
  let slot = Math.min(filled, capacity - 1)
  while (slot > 0 && (depths[slot - 1] ?? Infinity) > depth) {
    indices[slot] = indices[slot - 1] ?? -1
    depths[slot] = depths[slot - 1] ?? Infinity
    slot--
  }
  indices[slot] = index
  depths[slot] = depth
  return Math.min(filled + 1, capacity)
}
