import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import type { TerrainConfig } from './terrainConfig'

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

interface NoiseSet {
  warpX: NoiseFunction2D
  warpZ: NoiseFunction2D
  hills: NoiseFunction2D
  rangeMask: NoiseFunction2D
  ridges: NoiseFunction2D
  peaks: NoiseFunction2D
  plateaus: NoiseFunction2D
  detail: NoiseFunction2D
  rivers: NoiseFunction2D
}

/** FNV-1a string hash, used to turn a seed string into a 32-bit PRNG seed. */
function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Mulberry32: tiny seeded PRNG. `simplex-noise` uses it to shuffle its permutation table. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const noiseCache = new Map<string, NoiseSet>()

function noiseFor(seed: string): NoiseSet {
  const cached = noiseCache.get(seed)
  if (cached) return cached
  const make = (layer: string) => createNoise2D(mulberry32(hashString(`${seed}:${layer}`)))
  const set: NoiseSet = {
    warpX: make('warpX'),
    warpZ: make('warpZ'),
    hills: make('hills'),
    rangeMask: make('rangeMask'),
    ridges: make('ridges'),
    peaks: make('peaks'),
    plateaus: make('plateaus'),
    detail: make('detail'),
    rivers: make('rivers'),
  }
  noiseCache.set(seed, set)
  return set
}

/** fBm, normalized to roughly -1..1. */
function fbm(noise: NoiseFunction2D, x: number, z: number, octaves: number): number {
  let sum = 0
  let amplitude = 1
  let frequency = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise(x * frequency, z * frequency)
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / total
}

/** Ridged multifractal, 0..1. 1 is the crest of a ridge. */
function ridged(noise: NoiseFunction2D, x: number, z: number, octaves: number): number {
  let sum = 0
  let amplitude = 1
  let frequency = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * frequency, z * frequency))
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

/** Terrain height in metres at world (x, z). Deterministic for a given `config.seed`. */
export function heightAt(x: number, z: number, config: TerrainConfig): number {
  const n = noiseFor(config.seed)

  const wx = x + WARP_STRENGTH * fbm(n.warpX, x / WARP_SCALE, z / WARP_SCALE, 3)
  const wz = z + WARP_STRENGTH * fbm(n.warpZ, x / WARP_SCALE, z / WARP_SCALE, 3)

  // Rolling hills everywhere: 0..hillHeight.
  const hills = fbm(n.hills, wx / HILL_SCALE, wz / HILL_SCALE, 5)
  let height = (hills * 0.5 + 0.5) * config.hillHeight

  // Mountain ranges: a very low-frequency mask decides where ranges exist at all, so most of the
  // world stays hills and ranges come as distinct bands. Ridged noise shapes the range itself.
  const rangeMask = smoothstep(
    0.05,
    0.35,
    fbm(n.rangeMask, wx / RANGE_MASK_SCALE, wz / RANGE_MASK_SCALE, 2),
  )
  if (rangeMask > 0) {
    const ridge = ridged(n.ridges, wx / RIDGE_SCALE, wz / RIDGE_SCALE, 5)
    height += rangeMask * ridge * ridge * config.mountainHeight
  }

  // Isolated peaks: only where the peak noise spikes, and never inside a range (keeps them
  // standing alone, and keeps total height under the flight ceiling).
  const peakShape = smoothstep(0.62, 1, n.peaks(wx / PEAK_SCALE, wz / PEAK_SCALE))
  if (peakShape > 0) {
    height += (1 - rangeMask) * peakShape * peakShape * config.peakHeight
  }

  // Plateaus: a sharp mask lifts the ground to one flat level, which leaves steep cliff edges.
  const plateauMask = smoothstep(
    0.42,
    0.5,
    fbm(n.plateaus, wx / PLATEAU_SCALE, wz / PLATEAU_SCALE, 2),
  )
  if (plateauMask > 0) {
    const plateauTop =
      config.hillHeight * 0.5 +
      config.plateauHeight +
      n.detail(wx / DETAIL_SCALE, wz / DETAIL_SCALE) * 3
    height += (Math.max(height, plateauTop) - height) * plateauMask * (1 - rangeMask)
  }

  // Lakes are sized by the broad shape of the land (the hills without their small bumps), so they
  // fill whole valleys instead of every little dip.
  const broadHills = fbm(n.hills, wx / HILL_SCALE, wz / HILL_SCALE, 2)
  height = carveLakes(height, height + (broadHills - hills) * 0.5 * config.hillHeight, config)
  return carveRivers(
    height,
    fbm(n.rivers, wx / config.riverScale, wz / config.riverScale, 3),
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
 * would cut through rises, so they stay in the lowlands.
 */
export function carveRivers(height: number, riverNoise: number, config: TerrainConfig): number {
  const distance = Math.abs(riverNoise)
  if (distance >= config.riverValleyWidth) return height
  const fade = 1 - smoothstep(config.riverMaxHeight * 0.6, config.riverMaxHeight, height)
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

/**
 * Picks a spawn spot over a valley near the origin: the grid point within `searchRadius` whose
 * surrounding ground (sampled in a ring) is lowest, so the plane starts with open air around it.
 */
export function findSpawnPoint(
  config: TerrainConfig,
  searchRadius = 3000,
  gridStep = 250,
): SpawnPoint {
  const ringRadius = 400
  let best: SpawnPoint = { x: 0, z: 0, groundHeight: heightAt(0, 0, config) }
  let bestScore = Infinity
  for (let x = -searchRadius; x <= searchRadius; x += gridStep) {
    for (let z = -searchRadius; z <= searchRadius; z += gridStep) {
      let score = heightAt(x, z, config)
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2
        score += heightAt(
          x + Math.cos(angle) * ringRadius,
          z + Math.sin(angle) * ringRadius,
          config,
        )
      }
      if (score < bestScore) {
        bestScore = score
        best = { x, z, groundHeight: heightAt(x, z, config) }
      }
    }
  }
  return best
}
