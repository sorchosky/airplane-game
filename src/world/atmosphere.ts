import { activeLighting } from './lightingPreset'
import type { TerrainConfig } from './terrainConfig'

// Pure sky and haze math (cloud shapes and layout live in `cloudMath.ts`). No React or Three.
// The GLSL twin of the haze functions lives in `atmosphereShader.ts` and must stay in step.
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

/** Small, fast seeded PRNG: the same seed always gives the same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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
