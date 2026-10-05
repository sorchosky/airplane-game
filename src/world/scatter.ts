import { createNoise4D, type NoiseFunction4D } from 'simplex-noise'
import { chunkCoord, chunkKey } from './chunks'
import { hashString, heightAt, mulberry32 } from './heightfield'
import { islandPalmSites } from './islandPalms'
import { seaKeepsClear } from './sea'
import { smoothstep, terrainBandWeights } from './terrainColor'
import type { TerrainConfig } from './terrainConfig'
import {
  sampleTorus,
  torusPoint,
  torusRadius,
  wrapIndex,
  wrapNear,
  type TorusPoint,
} from './torusNoise'

// Pure, deterministic foliage placement (#75). No React or Three, so it is unit tested and could
// move into a worker unchanged.
//
// How it works, in plain terms:
// - The world is cut into the terrain's 512 m chunks. Each chunk is a grid of cells, and each cell
//   gets one candidate spot, jittered inside the cell. Jittering a grid is a cheap stand-in for
//   Poisson-disc sampling: spots look random but are never bunched on top of each other.
// - Each cell's random numbers come from a generator seeded by the world seed and the cell's index,
//   wrapped to the world period (#176), so a cell always grows the same trees, whichever order
//   chunks load in, and the cell one period over grows the very same ones.
// - A slow "grove" noise clusters trees into woods on the grass band. The ground under a candidate
//   decides what may grow: trees and bushes on grass (conifers on high ground), boulders on rock,
//   nothing on sand, snow or under water.
// - Every instance carries a random `keep` in 0..1. Distance from the plane gives a share 0..1 of
//   instances to draw; an instance grows in while `keep` is under that share and shrinks away as
//   it passes. The same math runs in the vertex shader (`foliageMaterial.ts`), so thinning with
//   distance or with the quality governor is a smooth shrink, never a pop.

/** A circle foliage must stay out of, e.g. a landmark's footprint (#76). World metres. */
export interface FoliageExclusion {
  x: number
  z: number
  radius: number
}

export type Ground = 'water' | 'sand' | 'grass' | 'rock' | 'snow'

export const FOLIAGE_KINDS = ['round', 'conifer', 'bush', 'boulder', 'palm'] as const
export type FoliageKind = (typeof FOLIAGE_KINDS)[number]

/** One tree, bush or boulder. `y` is the ground height under it. */
export interface FoliageInstance {
  x: number
  y: number
  z: number
  /** Radians around +Y */
  yaw: number
  /** Uniform scale of the unit model */
  scale: number
  /** 0..1, compared against the distance share. Lower = survives thinning longer. */
  keep: number
  /** Radians of tilt about the instance's own Z, leaning its +X side down (palms, #235) */
  lean?: number
}

export type ChunkFoliage = Record<FoliageKind, FoliageInstance[]>

/** Height sampler, `heightAt` by default. Tests swap in flat or sloped worlds. */
export type HeightSampler = (x: number, z: number, config: TerrainConfig) => number

/** Width of the grow-in ramp, as a share of instances. See `growth`. */
export const GROW_SOFTNESS = 0.15

/** m between the lattice points foliage sits on: the finest terrain ring's vertex spacing. */
export function groundSpacing(config: TerrainConfig): number {
  return config.lodRings[0]?.spacing ?? 8
}

// ---------------------------------------------------------------------------------------------
// Ground

/**
 * Heights on the terrain's vertex lattice over one square patch, sampled lazily and cached. The
 * lattice is world-aligned at multiples of `spacing`, exactly where the nearest terrain ring puts
 * its vertices, so heights interpolated from it lie on the drawn triangles.
 */
export class GroundPatch {
  private readonly heights: Float64Array
  private readonly originI: number
  private readonly originJ: number
  private readonly cells: number

  constructor(
    minX: number,
    minZ: number,
    size: number,
    private readonly config: TerrainConfig,
    private readonly sample: HeightSampler = heightAt,
    readonly spacing = groundSpacing(config),
  ) {
    this.originI = Math.floor(minX / spacing)
    this.originJ = Math.floor(minZ / spacing)
    this.cells = Math.ceil((minX + size) / spacing) - this.originI + 1
    this.heights = new Float64Array((this.cells + 1) * (this.cells + 1)).fill(Number.NaN)
  }

  private lattice(i: number, j: number): number {
    const li = Math.min(Math.max(i - this.originI, 0), this.cells)
    const lj = Math.min(Math.max(j - this.originJ, 0), this.cells)
    const index = lj * (this.cells + 1) + li
    const cached = this.heights[index] ?? Number.NaN
    if (!Number.isNaN(cached)) return cached
    const height = this.sample(
      (li + this.originI) * this.spacing,
      (lj + this.originJ) * this.spacing,
      this.config,
    )
    this.heights[index] = height
    return height
  }

  /**
   * Ground height and slope (`1 - normal.y`) at (x, z), on the same two triangles per quad the
   * terrain mesh draws (`buildTileIndices`: the diagonal runs from (i, j+1) to (i+1, j)).
   */
  surface(x: number, z: number): { height: number; slope: number } {
    const s = this.spacing
    const i = Math.floor(x / s)
    const j = Math.floor(z / s)
    const u = x / s - i
    const v = z / s - j
    const ha = this.lattice(i, j)
    const hb = this.lattice(i, j + 1)
    const hc = this.lattice(i + 1, j)
    let height: number
    let dx: number
    let dz: number
    if (u + v <= 1) {
      height = ha + (hc - ha) * u + (hb - ha) * v
      dx = hc - ha
      dz = hb - ha
    } else {
      const hd = this.lattice(i + 1, j + 1)
      height = hd + (hb - hd) * (1 - u) + (hc - hd) * (1 - v)
      dx = hd - hb
      dz = hd - hc
    }
    const ny = s / Math.hypot(dx, s, dz)
    return { height, slope: 1 - ny }
  }
}

/**
 * Which terrain band a point is in, from the same band weights the terrain shader paints with
 * (without its edge noise, so band edges can differ by a few metres). Anything within
 * `shoreMargin` of the water counts as water.
 */
export function classifyGround(height: number, slope: number, config: TerrainConfig): Ground {
  if (height < config.waterLevel + config.foliage.shoreMargin) return 'water'
  const weights = terrainBandWeights(height, slope, 0, config)
  if (weights.snow > 0.3) return 'snow'
  if (weights.rock > 0.5) return 'rock'
  if (weights.sand > 0.3) return 'sand'
  return 'grass'
}

// ---------------------------------------------------------------------------------------------
// Density

/** Governor foliage density (0..1) → how far out the distance bands reach, as a multiple. */
export function densityReach(density: number): number {
  // The bands shrink in radius by the square root, so the share of instances drawn (which goes
  // with the area) follows the density: 60 % density draws about 60 % of the foliage, and the
  // part it gives up is the far edge, where instances are smallest and most hazed.
  return Math.sqrt(Math.min(1, Math.max(0, density)))
}

/** Share (0..1) of instances drawn at `distance` m from the plane. */
export function distanceFalloff(
  distance: number,
  fadeStart: number,
  fadeEnd: number,
  reach = 1,
): number {
  return 1 - smoothstep(fadeStart * reach, fadeEnd * reach, distance)
}

/**
 * Scale (0..1) an instance is drawn at, given the share drawn where it stands. Instances whose
 * `keep` is under the share are full size; above it they shrink to nothing over `GROW_SOFTNESS`.
 * Mirrored in the foliage vertex shader.
 */
export function growth(share: number, keep: number): number {
  const value = (share * (1 + GROW_SOFTNESS) - keep) / GROW_SOFTNESS
  return Math.min(1, Math.max(0, value))
}

// ---------------------------------------------------------------------------------------------
// Scatter

const groveNoise = new Map<string, NoiseFunction4D>()
const grovePoint: TorusPoint = { cx: 1, sx: 0, cz: 1, sz: 0 }

/** Grove noise, 0..1: high inside woods, low in open meadow. Repeats every `worldPeriod`. */
export function groveAt(x: number, z: number, config: TerrainConfig): number {
  let noise = groveNoise.get(config.seed)
  if (!noise) {
    // Draw 3 of the grove field: of the first eight draws on the torus it is the one whose woods
    // by the spawn match the 2D field's (117k foliage triangles there, 30.8 % of the world in
    // woods), where the first draw put the basin in a wood 25 % over the triangle budget (#176).
    noise = createNoise4D(mulberry32(hashString(`${config.seed}:groves:3`)))
    groveNoise.set(config.seed, noise)
  }
  const period = config.worldPeriod
  const p = torusPoint(x, z, period, grovePoint)
  const radius = torusRadius(config.foliage.groveScale, period)
  // The second layer is 2.3 times finer and offset, as the 2D noise's `* 2.3 + 17` was.
  const n = 0.7 * sampleTorus(noise, p, radius) + 0.3 * sampleTorus(noise, p, radius * 2.3, 17)
  return 0.5 + 0.5 * n
}

/**
 * Whether (x, z) is inside any exclusion. With a `period`, distances are the wrapped
 * (minimum-image) ones, so a zone also clears its copies one period over.
 */
export function isExcluded(
  x: number,
  z: number,
  exclusions: readonly FoliageExclusion[],
  period = Infinity,
): boolean {
  const wrap = Number.isFinite(period)
  for (const zone of exclusions) {
    const dx = (wrap ? wrapNear(x, zone.x, period) : x) - zone.x
    const dz = (wrap ? wrapNear(z, zone.z, period) : z) - zone.z
    if (dx * dx + dz * dz < zone.radius * zone.radius) return true
  }
  return false
}

/** 32-bit seed for scatter cell (i, j): the world's seed mixed with the cell's wrapped index. */
export function cellSeed(base: number, i: number, j: number): number {
  let h = Math.imul(base ^ Math.imul(i, 0x27d4eb2d), 0x165667b1)
  h = Math.imul(h ^ (h >>> 15) ^ Math.imul(j, 0x9e3779b1), 0x85ebca77)
  return (h ^ (h >>> 13)) >>> 0
}

function emptyChunk(): ChunkFoliage {
  return { round: [], conifer: [], bush: [], boulder: [], palm: [] }
}

/**
 * Trees, bushes and boulders for foliage chunk (`cx`, `cz`), `foliageChunk` m square. Deterministic: the same chunk, config and
 * exclusions always give the same instances.
 */
export function scatterChunk(
  cx: number,
  cz: number,
  config: TerrainConfig,
  exclusions: readonly FoliageExclusion[] = [],
  sample: HeightSampler = heightAt,
): ChunkFoliage {
  const f = config.foliage
  const size = f.foliageChunk
  const minX = cx * size
  const minZ = cz * size
  const cells = Math.max(1, Math.round(size / f.treeCell))
  const pitch = size / cells
  // Cells per world period: a whole number (a unit test holds this), so the scatter repeats.
  const periodCells = Math.round(config.worldPeriod / pitch)
  const base = hashString(`${config.seed}:foliage`)
  const ground = new GroundPatch(minX, minZ, size, config, sample)
  const out = emptyChunk()
  const maxChance = Math.max(f.treeDensity + f.bushDensity * 4, f.boulderDensity)
  plantPalms(out, minX, minZ, size, config, exclusions, sample)

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const random = mulberry32(
        cellSeed(
          base,
          wrapIndex(cx * cells + i, periodCells),
          wrapIndex(cz * cells + j, periodCells),
        ),
      )
      const jx = random()
      const jz = random()
      const roll = random()
      const keep = random()
      const yaw = random() * Math.PI * 2
      const size01 = random()
      const variant = random()
      if (roll >= maxChance) continue

      const margin = (1 - f.jitter) / 2
      const x = minX + (i + margin + jx * f.jitter) * pitch
      const z = minZ + (j + margin + jz * f.jitter) * pitch
      if (isExcluded(x, z, exclusions, config.worldPeriod)) continue
      // The inland sea's water, beaches and islands (#223); the islands are #235's to dress.
      if (seaKeepsClear(x, z, config)) continue

      // Trees come in groves with a few lone ones in the meadow between; bushes hug grove edges.
      const grove = groveAt(x, z, config)
      const treeChance =
        f.meadowTreeChance +
        (f.treeDensity - f.meadowTreeChance) * smoothstep(f.groveLow, f.groveHigh, grove)
      const edge = Math.max(0, 1 - Math.abs(grove - f.groveLow) / 0.12)
      const bushChance = f.bushDensity * (0.05 + 3 * edge)
      if (roll >= treeChance + bushChance && roll >= f.boulderDensity) continue

      const { height, slope } = ground.surface(x, z)
      const band = classifyGround(height, slope, config)
      const instance = { x, y: height, z, yaw, scale: 1, keep }
      if (band === 'rock') {
        if (roll < f.boulderDensity) out.boulder.push({ ...instance, scale: 0.6 + size01 * 1.1 })
      } else if (band === 'grass') {
        if (roll < treeChance) {
          const coniferShare = 0.08 + 0.92 * smoothstep(f.coniferLow, f.coniferHigh, height)
          const kind = variant < coniferShare ? 'conifer' : 'round'
          out[kind].push({ ...instance, scale: 0.8 + size01 * 0.45 })
        } else if (roll < treeChance + bushChance) {
          out.bush.push({ ...instance, scale: 0.7 + size01 * 0.6 })
        }
      }
    }
  }
  return out
}

/** Moves `value` by whole periods to the copy at or after `min`. */
function periodAfter(value: number, min: number, period: number): number {
  return min + ((((value - min) % period) + period) % period)
}

/**
 * The island palms (#235) that stand in this chunk, at the copy of the world the chunk is in. The
 * palms are a fixed list (`islandPalms.ts`), not a grid of candidates, so a chunk only asks
 * which of them fall inside it.
 */
function plantPalms(
  out: ChunkFoliage,
  minX: number,
  minZ: number,
  size: number,
  config: TerrainConfig,
  exclusions: readonly FoliageExclusion[],
  sample: HeightSampler,
): void {
  const period = config.worldPeriod
  for (const palm of islandPalmSites(config, sample)) {
    const x = periodAfter(palm.x, minX, period)
    if (x >= minX + size) continue
    const z = periodAfter(palm.z, minZ, period)
    if (z >= minZ + size) continue
    if (isExcluded(x, z, exclusions, period)) continue
    out.palm.push({
      x,
      y: palm.y,
      z,
      yaw: palm.yaw,
      scale: palm.scale,
      keep: palm.keep,
      lean: palm.lean,
    })
  }
}

// ---------------------------------------------------------------------------------------------
// Canopy blobs (#232)

/**
 * A far grove drawn as one lumpy canopy mass instead of its trees. The unit model is a mound of
 * radius 1 and height 1, so the instance is scaled (`radius`, `height`, `radius`).
 */
export interface CanopyBlob {
  x: number
  /** Lowest ground under the blob, less a few metres, so the mound's foot is buried */
  y: number
  z: number
  /** Radians around +Y */
  yaw: number
  /** m, horizontal radius */
  radius: number
  /** m, height of the mound above `y` */
  height: number
  /** 0..1, compared against the distance share, as for trees */
  keep: number
}

/**
 * The grove (if any) in canopy-blob cell (`cx`, `cz`), `blobCell` m square: one blob at the
 * centroid of the cell's grove samples that sit in a wood on dry grass, sized to cover them.
 * Deterministic, and on the same wrapped grove and height fields as the trees, so a blob stands
 * where the trees it replaces would. Cell indices wrap, so a cell one period over matches.
 */
export function scatterBlobCell(
  cx: number,
  cz: number,
  config: TerrainConfig,
  exclusions: readonly FoliageExclusion[] = [],
  sample: HeightSampler = heightAt,
): CanopyBlob[] {
  const f = config.foliage
  const size = f.blobCell
  const minX = cx * size
  const minZ = cz * size
  const n = f.blobSamples
  const step = size / n
  const woodsAt = (f.groveLow + f.groveHigh) / 2
  // A coarse ground lattice is enough: blobs are hundreds of metres across.
  const ground = new GroundPatch(minX, minZ, size, config, sample, 32)
  const spots: { x: number; z: number; height: number }[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = minX + (i + 0.5) * step
      const z = minZ + (j + 0.5) * step
      if (groveAt(x, z, config) < woodsAt) continue
      if (isExcluded(x, z, exclusions, config.worldPeriod) || seaKeepsClear(x, z, config)) continue
      const { height, slope } = ground.surface(x, z)
      if (classifyGround(height, slope, config) !== 'grass') continue
      spots.push({ x, z, height })
    }
  }
  if (spots.length < f.blobMinSamples) return []
  // A mound is rigid, so it covers only the spots near one ground height: on a hillside that is
  // a smaller blob, not one buried at its uphill end and floating at the other.
  const heights = spots.map((spot) => spot.height).sort((a, b) => a - b)
  const median = heights[Math.floor(heights.length / 2)] ?? 0
  const kept = spots.filter((spot) => Math.abs(spot.height - median) <= f.blobHeightBand)
  const count = kept.length
  if (count < f.blobMinSamples) return []
  const sumX = kept.reduce((sum, spot) => sum + spot.x, 0)
  const sumZ = kept.reduce((sum, spot) => sum + spot.z, 0)
  const periodCells = Math.round(config.worldPeriod / size)
  const random = mulberry32(
    cellSeed(
      hashString(`${config.seed}:blobs`),
      wrapIndex(cx, periodCells),
      wrapIndex(cz, periodCells),
    ),
  )
  let radius = Math.min(
    f.blobRadiusMax,
    Math.max(f.blobRadiusMin, Math.sqrt((count * step * step) / Math.PI) * (0.95 + 0.2 * random())),
  )
  const x = sumX / count
  const z = sumZ / count
  // The mound's foot is the lowest ground in reach (the centre and a ring at 70 % of its radius)
  // and its crown clears the highest by a canopy's depth, so no ground pokes through it. On rolling
  // ground the blob shrinks until the ground under it is near flat, and a grove on a slope that
  // never gets there stays trees only.
  let low = Infinity
  let high = -Infinity
  for (;;) {
    low = high = ground.surface(x, z).height
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      const at = sample(x + Math.cos(a) * radius * 0.7, z + Math.sin(a) * radius * 0.7, config)
      low = Math.min(low, at)
      high = Math.max(high, at)
    }
    if (high - low <= f.blobRelief) break
    if (radius * 0.8 < f.blobRadiusMin) return []
    radius *= 0.8
  }
  const y = low - 3
  const height = high - y + 12 + radius * 0.12
  return [
    {
      x,
      y,
      z,
      yaw: random() * Math.PI * 2,
      radius,
      height,
      keep: random(),
    },
  ]
}

/** Share (0..1) of canopy blobs drawn at `distance` m: in as the trees thin out, out far away. */
export function canopyShare(distance: number, config: TerrainConfig, reach = 1): number {
  const f = config.foliage
  const rise = smoothstep(f.blobFadeIn * reach, f.foliageDistance * reach, distance)
  return rise * distanceFalloff(distance, f.blobFadeStart, f.blobDistance, reach)
}

/**
 * Whether a blob can grow at all while the plane stays in its current foliage chunk. Unlike a
 * tree's, a blob's share rises then falls with distance, so the nearest the plane can get is not
 * where the share peaks: look across the whole range the plane can be at.
 */
export function blobMayGrow(
  nearestDistance: number,
  keep: number,
  config: TerrainConfig,
  reach: number,
): boolean {
  const span = config.foliage.foliageChunk * Math.SQRT2
  for (let k = 0; k <= 8; k++) {
    if (growth(canopyShare(nearestDistance + (span * k) / 8, config, reach), keep) > 0) return true
  }
  return false
}

export interface BlobSelection {
  /** Nearest the plane first. */
  blobs: CanopyBlob[]
  /** How many of the first blobs get an outline hull (within `blobOutlineDistance`). */
  outlined: number
}

/** Canopy blobs to upload for a plane at (px, pz) and a governor density. */
export function selectBlobs(
  cells: readonly CanopyBlob[][],
  px: number,
  pz: number,
  density: number,
  config: TerrainConfig,
): BlobSelection {
  const f = config.foliage
  const reach = densityReach(density)
  const picked: { blob: CanopyBlob; d: number }[] = []
  for (const cell of cells) {
    for (const blob of cell) {
      const d = distanceToCell(blob.x, blob.z, px, pz, f.foliageChunk)
      if (blobMayGrow(d, blob.keep, config, reach)) picked.push({ blob, d })
    }
  }
  picked.sort((a, b) => a.d - b.d)
  return {
    blobs: picked.map((p) => p.blob),
    outlined: picked.filter((p) => p.d < f.blobOutlineDistance * reach).length,
  }
}

// ---------------------------------------------------------------------------------------------
// Streaming

/** A square cell in the streamed foliage grid. */
export interface CellRef {
  x: number
  z: number
  key: string
  /** m, from the nearest point of the plane's own cell to the nearest point of this one */
  distance: number
}

function squareGap(a: number, b: number): number {
  // Gap between two cells along one axis, in cells: 0 when they touch or overlap.
  return Math.max(0, Math.abs(a - b) - 1)
}

/**
 * Every cell of `cellSize` m within `distance` m of the plane's cell, nearest first. Measured
 * from the plane's whole cell, not its position, so the set only changes when it crosses into a
 * new cell and everything it needs until the next crossing is already in it.
 */
export function cellsInRange(
  px: number,
  pz: number,
  distance: number,
  cellSize: number,
): CellRef[] {
  const cx = chunkCoord(px, cellSize)
  const cz = chunkCoord(pz, cellSize)
  const span = Math.ceil(distance / cellSize) + 1
  const cells: CellRef[] = []
  for (let z = cz - span; z <= cz + span; z++) {
    for (let x = cx - span; x <= cx + span; x++) {
      const gap = Math.hypot(squareGap(x, cx), squareGap(z, cz)) * cellSize
      if (gap < distance) cells.push({ x, z, key: chunkKey(x, z), distance: gap })
    }
  }
  return cells.sort((a, b) => a.distance - b.distance)
}

/** Distance from (x, z) to the nearest point of the square cell `cellSize` m containing (px, pz). */
export function distanceToCell(
  x: number,
  z: number,
  px: number,
  pz: number,
  cellSize: number,
): number {
  const minX = chunkCoord(px, cellSize) * cellSize
  const minZ = chunkCoord(pz, cellSize) * cellSize
  const dx = Math.max(minX - x, 0, x - (minX + cellSize))
  const dz = Math.max(minZ - z, 0, z - (minZ + cellSize))
  return Math.hypot(dx, dz)
}

/**
 * Whether an instance can grow in at all while the plane stays in its current cell: its `keep`
 * is under the share drawn at the nearest the plane can get. Instances that fail are left out
 * of the GPU buffers until the next rebuild.
 */
export function mayGrow(nearestDistance: number, keep: number, share: (d: number) => number) {
  return growth(share(nearestDistance), keep) > 0
}

/** m, where a kind has thinned to nothing at full density. Bushes and boulders stop short. */
export function foliageReach(kind: FoliageKind, config: TerrainConfig): number {
  const f = config.foliage
  return kind === 'bush' || kind === 'boulder' ? f.smallDistance : f.foliageDistance
}

export interface FoliageSelection {
  /** Per kind, nearest the plane first. */
  instances: ChunkFoliage
  /** Per kind, how many of the first instances get an outline hull (within `outlineDistance`). */
  outlined: Record<FoliageKind, number>
}

/** Tree, bush and boulder instances to upload for a plane at (px, pz) and a governor density. */
export function selectFoliage(
  chunks: readonly ChunkFoliage[],
  px: number,
  pz: number,
  density: number,
  config: TerrainConfig,
): FoliageSelection {
  const f = config.foliage
  const reach = densityReach(density)
  const instances = emptyChunk()
  const outlined: Record<FoliageKind, number> = {
    round: 0,
    conifer: 0,
    bush: 0,
    boulder: 0,
    palm: 0,
  }
  for (const kind of FOLIAGE_KINDS) {
    const end = foliageReach(kind, config)
    const share = (d: number) => distanceFalloff(d, f.foliageFadeStart, end, reach)
    const picked: { instance: FoliageInstance; d: number }[] = []
    for (const chunk of chunks) {
      for (const instance of chunk[kind]) {
        const d = distanceToCell(instance.x, instance.z, px, pz, f.foliageChunk)
        if (mayGrow(d, instance.keep, share)) picked.push({ instance, d })
      }
    }
    picked.sort((a, b) => a.d - b.d)
    instances[kind] = picked.map((p) => p.instance)
    outlined[kind] = picked.filter((p) => p.d < f.outlineDistance).length
  }
  return { instances, outlined }
}
