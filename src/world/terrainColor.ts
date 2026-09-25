import { color } from '../styles/tokens'
import { TERRAIN_CONFIG, type TerrainConfig } from './terrainConfig'

// Pure mirror of the terrain shader's coloring (`terrainMaterial.ts`), so the band logic can be
// unit tested. Keep the two in step: any change here needs the same change in the GLSL there.
//
// How it works, in plain terms: the shader knows each pixel's height and how steep the ground is
// there ("slope", from the surface normal: a normal pointing straight up means flat ground). It
// starts from grass, then paints sand near the water, rock where it's steep and snow where it's
// high. Each switch is a short smooth blend, and a slow noise nudges every threshold so the edges
// wander naturally instead of tracing perfect contour lines.

export type Rgb = readonly [number, number, number]

/** sRGB 0..1 channel → linear, the same curve Three.js uses for `new Color(hex)`. */
function srgbToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)
}

/** Token hex → linear RGB. Lighting math (and `MeshToonMaterial`'s diffuse color) is linear. */
export function linearRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [
    srgbToLinear(((value >> 16) & 0xff) / 255),
    srgbToLinear(((value >> 8) & 0xff) / 255),
    srgbToLinear((value & 0xff) / 255),
  ]
}

/** The token colors the terrain paints with, in linear RGB. */
export const TERRAIN_PALETTE = {
  grassLight: linearRgb(color.grassLight),
  grassShadow: linearRgb(color.grassShadow),
  sand: linearRgb(color.sand),
  rock: linearRgb(color.rock),
  snow: linearRgb(color.snow),
  waterShallow: linearRgb(color.waterShallow),
  waterDeep: linearRgb(color.waterDeep),
} as const

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** How much of each band shows at a point, 0..1 each. Grass is whatever the others leave. */
export interface TerrainBandWeights {
  /** 0 = `grass-light`, up to `grassVariation` toward `grass-shadow` */
  grassShade: number
  sand: number
  rock: number
  snow: number
  /** 0 above the water; up to `underwaterTint` below it */
  water: number
  /** 0 = `water-shallow`, 1 = `water-deep` */
  waterDepth: number
}

/**
 * Band weights at a point. `height` in m, `slope` = `1 - normal.y` (0 flat .. 1 vertical),
 * `noise` a smooth noise in -1..1 (the shader samples it at the pixel's world position).
 */
export function terrainBandWeights(
  height: number,
  slope: number,
  noise: number,
  config: TerrainConfig = TERRAIN_CONFIG,
): TerrainBandWeights {
  const b = config.bands
  const sandLine = config.waterLevel + b.sandHeight + noise * b.sandJitter
  const snowLine = b.snowHeight + noise * b.snowJitter
  const jitteredSlope = slope + noise * b.slopeJitter
  const depth = config.waterLevel - height
  return {
    grassShade: b.grassVariation * (0.5 - 0.5 * noise),
    sand: 1 - smoothstep(sandLine - b.sandBlend, sandLine + b.sandBlend, height),
    rock: smoothstep(b.rockSlope - b.rockBlend, b.rockSlope + b.rockBlend, jitteredSlope),
    snow:
      smoothstep(snowLine - b.snowBlend, snowLine + b.snowBlend, height) *
      (1 - smoothstep(b.snowMaxSlope - b.rockBlend, b.snowMaxSlope + b.rockBlend, jitteredSlope)),
    water: b.underwaterTint * smoothstep(0, 1, depth),
    waterDepth: smoothstep(0, b.deepWaterDepth, depth),
  }
}

/** Terrain albedo (linear RGB) at a point, before lighting and haze. Mirrors the shader. */
export function terrainColorAt(
  height: number,
  slope: number,
  noise: number,
  config: TerrainConfig = TERRAIN_CONFIG,
): Rgb {
  const w = terrainBandWeights(height, slope, noise, config)
  const p = TERRAIN_PALETTE
  let c = mix(p.grassLight, p.grassShadow, w.grassShade)
  c = mix(c, p.sand, w.sand)
  c = mix(c, p.rock, w.rock)
  c = mix(c, p.snow, w.snow)
  return mix(c, mix(p.waterShallow, p.waterDeep, w.waterDepth), w.water)
}
