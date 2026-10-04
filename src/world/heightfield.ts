import { createNoise4D, type NoiseFunction4D } from 'simplex-noise'
import { applyBasin } from './basin'
import { massifMask } from './massifs'
import { applyRiverLake, applyRouteRiver, noiseRiverKeep } from './routeRiver'
import { applyRouteValley, isFullFloor, valleyAt, valleyFloor } from './routeValley'
import { applyPlungePool } from './stations'
import type { TerrainConfig } from './terrainConfig'
import { sampleTorus, torusPoint, torusRadius, wrapNear, type TorusPoint } from './torusNoise'

// Pure, deterministic terrain shape. No React or Three: this runs both on the main thread (soft
// floor, spawn point) and inside the terrain worker, and must give identical answers in both.
//
// Glossary, since these terms show up throughout:
// - Simplex noise: a smooth random function. Nearby inputs give nearby outputs in -1..1, so it
//   looks like gentle random bumps rather than static.
// - fBm ("fractal Brownian motion"): several layers ("octaves") of noise added together, each
//   twice the frequency and half the height of the last. Big shapes from the first layer, finer
//   and finer bumps from the rest. This is what makes hills look natural.
// - Ridged noise: fBm where each layer is folded with `1 - |n|`, turning smooth bumps into sharp
//   creases. Those creases read as mountain ridgelines.
// - Domain warping: before sampling, the (x, z) position is itself pushed around by another
//   noise. It bends every feature so nothing lines up on a grid or visibly repeats.
// - Carving: after the land is shaped, lakes and rivers are dug into it. Anything that ends up
//   below `waterLevel` is under the water plane (`Water.tsx`).
// - Wrapping (#176): the world repeats every `worldPeriod` m on x and z. Every noise is sampled on
//   a torus (`torusNoise.ts`), so it repeats with no seam, and the designed features (basin, route
//   valley, river, stations) sit inside one period round the basin centre, found by wrapping the
//   query point to its nearest copy (the minimum image).

interface NoiseSet {
  warpX: NoiseFunction4D
  warpZ: NoiseFunction4D
  hills: NoiseFunction4D
  rangeMask: NoiseFunction4D
  ridges: NoiseFunction4D
  massifs: NoiseFunction4D
  crags: NoiseFunction4D
  peaks: NoiseFunction4D
  plateaus: NoiseFunction4D
  detail: NoiseFunction4D
  rivers: NoiseFunction4D
  /** Torus radius of each field's first octave, for this set's world period. */
  radius: {
    warp: number
    hills: number
    rangeMask: number
    ridges: number
    massifs: number
    crags: number
    peaks: number
    plateaus: number
    detail: number
    rivers: number
  }
}

/** FNV-1a string hash, used to turn a seed string into a 32-bit PRNG seed. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Mulberry32: tiny seeded PRNG. `simplex-noise` uses it to shuffle its permutation table. */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const noiseCache = new Map<string, NoiseSet>()
// `heightAt` runs per vertex with one config, so the last lookup is kept to skip building a key.
let lastConfig: TerrainConfig | null = null
let lastSet: NoiseSet | null = null

function noiseFor(config: TerrainConfig): NoiseSet {
  if (config === lastConfig && lastSet) return lastSet
  const set = noiseSetFor(config)
  lastConfig = config
  lastSet = set
  return set
}

function noiseSetFor(config: TerrainConfig): NoiseSet {
  const { seed, worldPeriod: period, riverScale } = config
  const massifScale = config.massifs.ridgeScale
  const cragScale = config.basin.cragScale
  const key = `${seed}|${period}|${riverScale}|${massifScale}|${cragScale}`
  const cached = noiseCache.get(key)
  if (cached) return cached
  const make = (layer: string) => createNoise4D(mulberry32(hashString(`${seed}:${layer}`)))
  const radius = (scale: number) => torusRadius(scale, period)
  const set: NoiseSet = {
    warpX: make('warpX'),
    warpZ: make('warpZ'),
    hills: make('hills'),
    rangeMask: make('rangeMask'),
    ridges: make('ridges'),
    massifs: make('massifs'),
    crags: make('crags'),
    peaks: make('peaks'),
    plateaus: make('plateaus'),
    detail: make('detail'),
    rivers: make('rivers'),
    radius: {
      warp: radius(WARP_SCALE),
      hills: radius(HILL_SCALE),
      rangeMask: radius(RANGE_MASK_SCALE),
      ridges: radius(RIDGE_SCALE),
      massifs: radius(massifScale),
      crags: radius(cragScale),
      peaks: radius(PEAK_SCALE),
      plateaus: radius(PLATEAU_SCALE),
      detail: radius(DETAIL_SCALE),
      rivers: radius(riverScale),
    },
  }
  noiseCache.set(key, set)
  return set
}

/** fBm on the torus, normalized to roughly -1..1. `radius` is the first octave's. */
function fbm(noise: NoiseFunction4D, p: TorusPoint, radius: number, octaves: number): number {
  let sum = 0
  let amplitude = 1
  let frequency = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * sampleTorus(noise, p, radius * frequency)
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / total
}

/** Ridged multifractal on the torus, 0..1. 1 is the crest of a ridge. */
function ridged(noise: NoiseFunction4D, p: TorusPoint, radius: number, octaves: number): number {
  let sum = 0
  let amplitude = 1
  let frequency = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(sampleTorus(noise, p, radius * frequency))
    sum += amplitude * n * n
    total += amplitude
    amplitude *= 0.5
    frequency *= 2.1
  }
  return sum / total
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Feature sizes, in metres. Frequencies below are 1 / these.
const WARP_SCALE = 4000
const WARP_STRENGTH = 450
const HILL_SCALE = 1300
const RANGE_MASK_SCALE = 11000
const RIDGE_SCALE = 2200
const PEAK_SCALE = 4500
const PLATEAU_SCALE = 5500
const DETAIL_SCALE = 180
// Massif mask (0..1) by which ranges, peaks and plateaus have given way to it.
const MASSIF_YIELD = 0.3
// The massifs stand 1 km and more from the loop, where a fifth octave (~90 m) is under a few
// vertices of the LOD drawing it, so four keep the build cost down.
const MASSIF_OCTAVES = 4
// Scales the hills' fine octaves (about -0.3..0.3) to the -1..1 detail the valley floor takes.
const VALLEY_DETAIL_GAIN = 4

/** Terrain height in metres at world (x, z). Deterministic for a given `config.seed`. */
export function heightAt(x: number, z: number, config: TerrainConfig): number {
  // Every designed feature lives inside the one period centred on the basin, so the point is
  // wrapped to its copy there first: distances to them are the wrapped (minimum-image) ones.
  const { centerX, centerZ } = config.basin
  const lx = wrapNear(x, centerX, config.worldPeriod)
  const lz = wrapNear(z, centerZ, config.worldPeriod)
  // The route river's lake (#174) is scooped into the return notch, then the waterfall's plunge
  // pool (#173) is dug last, into the valley floor in front of it.
  return applyPlungePool(lx, lz, applyRiverLake(lx, lz, landHeight(lx, lz, config), config), config)
}

// Reused per call: `heightAt` runs per vertex and nothing keeps these past it.
const at: TorusPoint = { cx: 1, sx: 0, cz: 1, sz: 0 }
const warped: TorusPoint = { cx: 1, sx: 0, cz: 1, sz: 0 }

// The noise set `sampleCrags` reads, set by `landHeight` just before the basin may call it. A
// fixed function rather than a closure per call, since `heightAt` runs per vertex.
let cragSet: NoiseSet | null = null
const sampleCrags = (): number =>
  cragSet ? ridged(cragSet.crags, warped, cragSet.radius.crags, 2) : 0

function landHeight(x: number, z: number, config: TerrainConfig): number {
  const n = noiseFor(config)
  const r = n.radius
  const period = config.worldPeriod

  torusPoint(x, z, period, at)
  const wx = x + WARP_STRENGTH * fbm(n.warpX, at, r.warp, 3)
  const wz = z + WARP_STRENGTH * fbm(n.warpZ, at, r.warp, 3)
  // The warp itself repeats, so (wx, wz) moves by exactly one period when (x, z) does.
  const w = torusPoint(wx, wz, period, warped)

  // Rolling hills everywhere: 0..hillHeight. `broadHills` is their broad shape, without the
  // small bumps: the same fBm stopped after two octaves.
  let hillSum = 0
  let hillAmplitude = 1
  let hillTotal = 0
  let broadHills = 0
  for (let i = 0; i < 5; i++) {
    hillSum += hillAmplitude * sampleTorus(n.hills, w, r.hills * 2 ** i)
    hillTotal += hillAmplitude
    if (i === 1) broadHills = hillSum / hillTotal
    hillAmplitude *= 0.5
  }
  const hills = hillSum / hillTotal

  // The route valley (#172) is applied last, but on its floor it replaces the land outright, so
  // there the rest is never built. The hills' finer octaves (what `hills` adds over `broadHills`,
  // ~80 to 330 m bumps) keep the floor from looking graded flat.
  const valley = valleyAt(x, z, config)
  const valleyDetail = Math.tanh(VALLEY_DETAIL_GAIN * (hills - broadHills))
  // The route river (#174) is cut into whatever the valley leaves, on the floor or off it.
  if (valley && isFullFloor(valley)) {
    return applyRouteRiver(valleyFloor(valleyDetail, valley.nearest, config.valley), valley, config)
  }

  let height = (hills * 0.5 + 0.5) * config.hillHeight

  // Massifs (#222): authored mountain regions flanking the loop, kept out of the route valley,
  // the basin and the inland sea by their mask. A bulk lifts the whole region and ridged relief
  // stands on it, so the ranges read as tall rock with saddles, not lone bumps.
  const massif = massifMask(x, z, wx, wz, config)
  if (massif > 0) {
    const m = config.massifs
    const ridge = ridged(n.massifs, w, r.massifs, MASSIF_OCTAVES)
    height += massif * m.height * (m.bodyShare + (1 - m.bodyShare) * ridge * ridge)
  }

  // Mountain ranges: a very low-frequency mask decides where ranges exist at all, so most of the
  // world stays hills and ranges come as distinct bands. Ridged noise shapes the range itself.
  // A massif stands in for ranges, peaks and plateaus where they would meet, so they never stack.
  // They give way over the massif's first 30 %, so most of a massif skips their noise.
  const yieldToMassif = 1 - smoothstep(0, MASSIF_YIELD, massif)
  const range = yieldToMassif > 0 ? smoothstep(0.05, 0.35, fbm(n.rangeMask, w, r.rangeMask, 2)) : 0
  const rangeMask = yieldToMassif * range
  if (rangeMask > 0) {
    const ridge = ridged(n.ridges, w, r.ridges, 5)
    height += rangeMask * ridge * ridge * config.mountainHeight
  }

  // Isolated peaks: only where the peak noise spikes, and never inside a range or a massif (keeps
  // them standing alone, and keeps total height in check).
  // Deep inside a range neither peaks nor plateaus show, so their noise isn't sampled there.
  const outsideRange = yieldToMassif * (1 - range)
  const peakShape = outsideRange > 0 ? smoothstep(0.62, 1, sampleTorus(n.peaks, w, r.peaks)) : 0
  if (peakShape > 0) {
    height += outsideRange * peakShape * peakShape * config.peakHeight
  }

  // Plateaus: a sharp mask lifts the ground to one flat level, which leaves steep cliff edges.
  const plateauMask =
    outsideRange > 0 ? smoothstep(0.42, 0.5, fbm(n.plateaus, w, r.plateaus, 2)) : 0
  if (plateauMask > 0) {
    const plateauTop =
      config.hillHeight * 0.5 + config.plateauHeight + sampleTorus(n.detail, w, r.detail) * 3
    height += (Math.max(height, plateauTop) - height) * plateauMask * outsideRange
  }

  // Lakes are sized by the broad shape of the land, so they fill whole valleys instead of every
  // little dip.
  height = carveLakes(height, height + (broadHills - hills) * 0.5 * config.hillHeight, config)
  // Noise rivers stay out of the route valley's corridor: the route river runs its floor (#174),
  // and out of the massifs, as ranges do. They have faded out entirely by `riverMaxHeight`, so
  // higher ground skips their noise.
  const riverKeep =
    height < config.riverMaxHeight && yieldToMassif > 0
      ? yieldToMassif * noiseRiverKeep(valley, config.valley)
      : 0
  if (riverKeep > 0) {
    height = carveRivers(height, fbm(n.rivers, w, r.rivers, 3), config, riverKeep)
  }
  // The home basin goes after the land so its designed floor and ridge heights hold (#171).
  cragSet = n
  height = applyBasin(x, z, height, config.basin, sampleCrags)
  // The route valley goes last: it carries the notches' floors on through the basin's outer ring
  // and out round the loop. Most of the world is beyond its reach and paid one grid lookup.
  if (!valley) return height
  return applyRouteRiver(
    applyRouteValley(height, valleyDetail, valley, config.valley),
    valley,
    config,
  )
}

/**
 * Lakes: where the broad shape of the land (`broadHeight`) is below `lakeBasinHeight`, the ground
 * is scooped deeper the lower it is, so the lowest valleys sink under `waterLevel` with gently
 * shelving shores. The scoop is a smoothstep, so the ground stays smooth where it starts.
 */
export function carveLakes(height: number, broadHeight: number, config: TerrainConfig): number {
  const deficit = config.lakeBasinHeight - broadHeight
  if (deficit <= 0) return height
  return height - config.lakeDepth * smoothstep(0, config.lakeBasinBand, deficit)
}

/**
 * Rivers follow the zero crossings of a smooth noise (`riverNoise`, -1..1), which wander across
 * the map as long, unbroken, branching lines. Near a crossing the hills are pulled down into a
 * valley, and right at it a channel is dug below `waterLevel`. Rivers fade out as the ground they
 * would cut through rises, so they stay in the lowlands. `keep` (0..1) scales the whole carve, so
 * callers can fade a river out where it isn't wanted.
 */
export function carveRivers(
  height: number,
  riverNoise: number,
  config: TerrainConfig,
  keep = 1,
): number {
  const distance = Math.abs(riverNoise)
  if (distance >= config.riverValleyWidth) return height
  const fade = keep * (1 - smoothstep(config.riverMaxHeight * 0.6, config.riverMaxHeight, height))
  if (fade <= 0) return height

  // Valley: pull the ground down to just above the water, steepest near the channel.
  const valley = 1 - smoothstep(0, config.riverValleyWidth, distance)
  const bank = config.waterLevel + config.bands.sandHeight
  let carved = height + (Math.min(height, bank) - height) * valley * valley

  // Channel: the river bed itself, below the water.
  const channel = 1 - smoothstep(config.riverWidth * 0.4, config.riverWidth, distance)
  carved += (Math.min(carved, config.waterLevel - config.riverDepth) - carved) * channel

  return height + (carved - height) * fade
}

/** Height of whatever the plane would hit at (x, z): the ground, or the water over a lake. */
export function surfaceHeightAt(x: number, z: number, config: TerrainConfig): number {
  return Math.max(heightAt(x, z, config), config.waterLevel)
}

/**
 * Unit surface normal at (x, z), by central differences `eps` metres apart. Returned as a plain
 * `[x, y, z]` tuple so the worker doesn't need Three.
 */
export function normalAt(
  x: number,
  z: number,
  config: TerrainConfig,
  eps = 1,
): [number, number, number] {
  const dx = heightAt(x + eps, z, config) - heightAt(x - eps, z, config)
  const dz = heightAt(x, z + eps, config) - heightAt(x, z - eps, config)
  const nx = -dx
  const ny = 2 * eps
  const nz = -dz
  const length = Math.hypot(nx, ny, nz)
  return [nx / length, ny / length, nz / length]
}

export interface SpawnPoint {
  x: number
  z: number
  groundHeight: number
}

/** The spawn is the centre of the home basin (#171). */
export function findSpawnPoint(config: TerrainConfig): SpawnPoint {
  const { centerX: x, centerZ: z } = config.basin
  return { x, z, groundHeight: heightAt(x, z, config) }
}
