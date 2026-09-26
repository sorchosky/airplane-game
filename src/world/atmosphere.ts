import type { LightingPreset } from '../styles/tokens'
import { activeLighting } from './lightingPreset'
import type { TerrainConfig } from './terrainConfig'

// Pure sky, haze and cloud-layout math. No React or Three. The GLSL twin of the haze functions
// lives in `atmosphereShader.ts` and must stay in step with these.
//
// How the haze works, in plain terms:
// - Real air scatters light, so the further away something is, the more of the air's own colour
//   you see instead of the object's. Games fake this with "fog": each pixel is blended toward a
//   haze colour by an amount that grows with its distance from the camera.
// - Here there are two layers. The near layer is the preset's `fog` colour (cool and pale by day,
//   warm and dusty at golden hour, #64) that builds up
//   gradually (exponential: quick at first, then levelling off at `hazeWarmMax`). The far layer
//   blends toward whatever the sky looks like in that exact direction, reaching 100% at
//   `hazeFadeEnd`. Because a fully hazed hill is *exactly* the sky colour behind it, the terrain
//   edge at 10 km, and the line where land meets sky, can never be seen.
// - The horizon facing the sun takes the preset's horizon colour; the horizon facing away from it
//   shifts toward the zenith colour. So distant land away from the sun fades to blue, the way
//   hills do.

type Vec3 = readonly [number, number, number]

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

/**
 * Unit vector pointing from the world *toward* the sun. The one source for the sky's sun disc,
 * the haze glow and the directional light.
 */
export const SUN_DIRECTION: Vec3 = normalize(activeLighting().sunDirection)

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/** 0..`hazeWarmMax`, how much of the warm near-haze colour covers a pixel `distance` m away. */
export function nearHazeAmount(distance: number, config: TerrainConfig): number {
  return config.hazeWarmMax * (1 - Math.exp(-distance * config.hazeDensity))
}

/** 0..1, how much of the sky colour behind it covers a pixel `distance` m away. */
export function farHazeAmount(
  distance: number,
  config: TerrainConfig,
  viewDistance: number = config.viewDistance,
): number {
  const { start, end } = hazeForViewDistance(viewDistance, config)
  return smoothstep(start, end, distance)
}

/**
 * The closest the terrain edge can ever be to the plane, in metres. Tiles are picked by distance
 * from the centre of the plane's chunk (see `selectTiles`), and the plane can sit up to half a
 * chunk diagonal away from that centre.
 */
export function nearestTerrainEdge(
  config: TerrainConfig,
  viewDistance: number = config.viewDistance,
): number {
  return viewDistance - config.chunkSize * Math.SQRT1_2
}

/**
 * The far-haze fade for a given terrain build distance: `hazeFadeStart` and `hazeFadeEnd` scaled
 * with it, so a shorter view distance (the governor's last rung, #65) closes the haze in and the
 * terrain edge stays fully hazed. The shader reads these as the scene fog's near and far.
 */
export function hazeForViewDistance(
  viewDistance: number,
  config: TerrainConfig,
): { start: number; end: number } {
  const scale = viewDistance / config.viewDistance
  return { start: config.hazeFadeStart * scale, end: config.hazeFadeEnd * scale }
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

/** An sRGB hex colour as linear RGB, the space three lights in. */
export function hexToLinear(hex: string): [number, number, number] {
  const channel = (offset: number) => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return [channel(1), channel(3), channel(5)]
}

/**
 * Sunlit cloud faces land on this multiple of the preset's `cloudLight` (linear, before tone
 * mapping). ACES maps 1.3 to about 0.8: near-white on screen, and under the bloom threshold, so
 * clouds never bloom.
 */
export const CLOUD_LIT_GAIN = 1.3

export interface CloudShading {
  /** Linear Lambert colour, 0..1 per channel. */
  albedo: Vec3
  /** Linear emissive colour, at intensity 1. */
  emissive: Vec3
}

/**
 * Lambert colour and emissive (#64) that put a cloud's shadowed side on the preset's
 * `cloudShadow` and its sunlit side on `cloudLight` × `CLOUD_LIT_GAIN`, whatever the preset's sun
 * and sky fill. three's Lambert gives `albedo / π × (sun × N·L + hemisphere) + emissive`; for a
 * side-facing puff (hemisphere halfway between sky and ground), N·L = 0 and N·L = 1 are two
 * equations for the two unknowns. Tops pick up a little more sky blue, undersides a little ground.
 */
export function cloudShading(preset: LightingPreset): CloudShading {
  const lit = hexToLinear(preset.cloudLight)
  const shadow = hexToLinear(preset.cloudShadow)
  const sun = hexToLinear(preset.sun)
  const sky = hexToLinear(preset.ambientSky)
  const ground = hexToLinear(preset.ambientGround)
  const albedo: [number, number, number] = [0, 0, 0]
  const emissive: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const sunLight = (sun[i] ?? 0) * preset.sunIntensity
    const skyFill =
      (0.5 * ((sky[i] ?? 0) + (ground[i] ?? 0)) * preset.hemisphereIntensity) / Math.PI
    const target = (lit[i] ?? 0) * CLOUD_LIT_GAIN - (shadow[i] ?? 0)
    const a = sunLight > 0 ? Math.min(1, Math.max(0, (target * Math.PI) / sunLight)) : 1
    albedo[i] = a
    emissive[i] = Math.max(0, (shadow[i] ?? 0) - a * skyFill)
  }
  return { albedo, emissive }
}
