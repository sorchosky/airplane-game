import { lighting } from '../styles/tokens'
import type { TerrainConfig } from './terrainConfig'

// Pure sky, haze and cloud-layout math. No React or Three. The GLSL twin of the haze functions
// lives in `atmosphereShader.ts` and must stay in step with these.
//
// How the haze works, in plain terms:
// - Real air scatters light, so the further away something is, the more of the air's own colour
//   you see instead of the object's. Games fake this with "fog": each pixel is blended toward a
//   haze colour by an amount that grows with its distance from the camera.
// - Here there are two layers. The near layer is a warm dusty haze (`fog` token) that builds up
//   gradually (exponential: quick at first, then levelling off at `hazeWarmMax`). The far layer
//   blends toward whatever the sky looks like in that exact direction, reaching 100% at
//   `hazeFadeEnd`. Because a fully hazed hill is *exactly* the sky colour behind it, the terrain
//   edge at 10 km, and the line where land meets sky, can never be seen.
// - The horizon facing the sun is warm peach; the horizon facing away from it shifts toward the
//   dusky blue-violet zenith. So distant land away from the sun fades to blue, the way hills do
//   at sunset.

type Vec3 = readonly [number, number, number]

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

/**
 * Unit vector pointing from the world *toward* the sun. The one source for the sky's sun disc,
 * the haze glow and the directional light.
 */
export const SUN_DIRECTION: Vec3 = normalize(lighting.sunDirection)

/** Light intensities for the sun and its sky/ground fill. Tuned by eye against the tokens. */
export const LIGHT_INTENSITY = {
  sun: 2.2,
  hemisphere: 1.1,
} as const

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/** 0..`hazeWarmMax`, how much of the warm near-haze colour covers a pixel `distance` m away. */
export function nearHazeAmount(distance: number, config: TerrainConfig): number {
  return config.hazeWarmMax * (1 - Math.exp(-distance * config.hazeDensity))
}

/** 0..1, how much of the sky colour behind it covers a pixel `distance` m away. */
export function farHazeAmount(distance: number, config: TerrainConfig): number {
  return smoothstep(config.hazeFadeStart, config.hazeFadeEnd, distance)
}

/**
 * The closest the terrain edge can ever be to the plane, in metres. Tiles are picked by distance
 * from the centre of the plane's chunk (see `selectTiles`), and the plane can sit up to half a
 * chunk diagonal away from that centre.
 */
export function nearestTerrainEdge(config: TerrainConfig): number {
  return config.viewDistance - config.chunkSize * Math.SQRT1_2
}

export interface CloudConfig {
  seed: number
  /** Number of cloud clusters */
  clusters: number
  /** Puffs (spheres) per cluster, inclusive range */
  puffsMin: number
  puffsMax: number
  /** m, cluster base altitude range. Puffs sit up to 0.4 × radius above it. */
  altitudeMin: number
  altitudeMax: number
  /** m, puff radius range */
  puffRadiusMin: number
  puffRadiusMax: number
  /** m, how far puffs spread horizontally from their cluster centre */
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

export const CLOUD_CONFIG: CloudConfig = {
  seed: 22,
  clusters: 56,
  puffsMin: 4,
  puffsMax: 8,
  altitudeMin: 320,
  altitudeMax: 460,
  puffRadiusMin: 35,
  puffRadiusMax: 90,
  clusterSpread: 160,
  fieldSize: 19000,
  windX: 6,
  windZ: 2.5,
}

export interface CloudPuff {
  /** m, cluster centre in the un-wrapped world at time 0 */
  clusterX: number
  clusterZ: number
  /** m, puff centre relative to its cluster centre, plus the cluster altitude in `y` */
  offsetX: number
  y: number
  offsetZ: number
  radius: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic cloud puffs. Each cluster is a flat-bottomed heap: puffs spread wide and low,
 * the biggest near the middle, so it reads as a cumulus rather than a ball.
 */
export function cloudLayout(config: CloudConfig): CloudPuff[] {
  const random = mulberry32(config.seed)
  const between = (min: number, max: number) => min + (max - min) * random()
  const puffs: CloudPuff[] = []
  for (let c = 0; c < config.clusters; c++) {
    const clusterX = between(-0.5, 0.5) * config.fieldSize
    const clusterZ = between(-0.5, 0.5) * config.fieldSize
    const altitude = between(config.altitudeMin, config.altitudeMax)
    const count = Math.floor(between(config.puffsMin, config.puffsMax + 1))
    for (let p = 0; p < count; p++) {
      const angle = between(0, Math.PI * 2)
      const reach = Math.sqrt(random()) * config.clusterSpread
      // Puffs near the centre are bigger, so the heap tapers toward its edges.
      const centrality = 1 - reach / config.clusterSpread
      const radius =
        config.puffRadiusMin + (config.puffRadiusMax - config.puffRadiusMin) * centrality
      puffs.push({
        clusterX,
        clusterZ,
        offsetX: Math.cos(angle) * reach,
        // Sit each puff so its bottom is near the cluster base: flat undersides read as cumulus.
        y: altitude + radius * 0.4,
        offsetZ: Math.sin(angle) * reach,
        radius,
      })
    }
  }
  return puffs
}

/** Wraps `value` into the window `center ± size / 2`. */
export function wrapAround(value: number, center: number, size: number): number {
  const shifted = value - center + size / 2
  return center + (shifted - Math.floor(shifted / size) * size) - size / 2
}
