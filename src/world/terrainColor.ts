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

/**
 * Per-pixel detail on top of the bands (#69, `docs/art-bible.md` §5): the noise samples and
 * lighting the shader has at the pixel. The shader samples the noise; this mirror only takes
 * the values, like `noise` above.
 */
export interface TerrainSurface {
  /** 400 m macro noise, -1..1: turns the grass hue and shifts the strata */
  macro: number
  /** a second, decorrelated macro sample, -1..1: moves the grass value */
  macroValue: number
  /** brush breakup noise, streaked down the slope, -1..1 */
  brush: number
  /** m from the camera: the brush and the strata fade out with distance */
  distance: number
  /** dot(surface normal, direction to the sun), -1..1 */
  sunFacing: number
  /** the lighting preset's ambient sky, linear: the cool side of the sun tint */
  ambientSky: Rgb
}

/** Rotates a colour's hue by `degrees` about the grey axis. Keeps its brightness (r + g + b). */
export function rotateHue(c: Rgb, degrees: number): Rgb {
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a) / Math.sqrt(3)
  const grey = ((c[0] + c[1] + c[2]) / 3) * (1 - cos)
  return [
    c[0] * cos + (c[2] - c[1]) * sin + grey,
    c[1] * cos + (c[0] - c[2]) * sin + grey,
    c[2] * cos + (c[1] - c[0]) * sin + grey,
  ]
}

/** The height warp that varies strata spacing has this wavelength, as a multiple of the mean spacing. */
export const STRATA_WARP_FACTOR = 1.6

/** m, wavelength of the height warp for `config`'s strata spacing. */
export function strataWarpLength(config: TerrainConfig = TERRAIN_CONFIG): number {
  return ((config.bands.strataSpacingMin + config.bands.strataSpacingMax) / 2) * STRATA_WARP_FACTOR
}

/**
 * Strata cycles at height `y`. Its rate swings between 1 / `strataSpacingMax` and
 * 1 / `strataSpacingMin` per metre as `y` climbs, so the bands sit irregularly apart rather than
 * on a ruler; the macro noise shifts the phase so they wave across the landscape.
 */
export function strataPhase(
  y: number,
  macro: number,
  config: TerrainConfig = TERRAIN_CONFIG,
): number {
  const b = config.bands
  const rate = (1 / b.strataSpacingMin + 1 / b.strataSpacingMax) / 2
  const swing = (1 / b.strataSpacingMin - 1 / b.strataSpacingMax) / 2
  const warp = strataWarpLength(config)
  return y * rate + swing * warp * Math.sin(y / warp) + macro * b.strataJitter
}

/** cos 60° and cos 30°: grass starts leaning to `grass-light` at 60° from the sun, fully by 30°. */
export const SUN_TINT_TOWARD = [0.5, Math.cos(Math.PI / 6)] as const
/** Faces turned this far from the sun (dot 0.35 down to 0) lean to the cool mix. */
export const SUN_TINT_AWAY = [0.35, 0] as const

/** How far grass leans to `grass-light` (toward) and to its cool mix (away), 0..1 each. */
export function sunTintWeights(
  sunFacing: number,
  config: TerrainConfig = TERRAIN_CONFIG,
): { toward: number; away: number } {
  const b = config.bands
  return {
    toward: b.sunTintToward * smoothstep(SUN_TINT_TOWARD[0], SUN_TINT_TOWARD[1], sunFacing),
    away: b.sunTintAway * (1 - smoothstep(SUN_TINT_AWAY[1], SUN_TINT_AWAY[0], sunFacing)),
  }
}

function scale(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k]
}

/** Relative luminance of a linear colour (Rec. 709 weights). */
export function luminance(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/**
 * The cool grass for faces turned from the sun: `grass-shadow` leaning toward the sky's hue. The
 * sky colour is first brought down to `grass-shadow`'s luminance, because in linear light the
 * sky is several times brighter than grass: mixed in raw it would lighten shaded slopes and
 * flatten the terrain's form, where it should only cool them.
 */
export function coolGrass(ambientSky: Rgb, config: TerrainConfig = TERRAIN_CONFIG): Rgb {
  const shadow = TERRAIN_PALETTE.grassShadow
  const skyAtShadow = scale(ambientSky, luminance(shadow) / Math.max(luminance(ambientSky), 1e-4))
  return mix(shadow, skyAtShadow, config.bands.sunTintCool)
}

/**
 * Terrain albedo (linear RGB) at a point, before lighting and haze. Mirrors the shader. Without
 * `surface` it is the plain bands; with it, the painterly detail from #69 is added.
 */
export function terrainColorAt(
  height: number,
  slope: number,
  noise: number,
  config: TerrainConfig = TERRAIN_CONFIG,
  surface?: TerrainSurface,
): Rgb {
  const w = terrainBandWeights(height, slope, noise, config)
  const p = TERRAIN_PALETTE
  const b = config.bands
  let grass = mix(p.grassLight, p.grassShadow, w.grassShade)
  if (surface) {
    const tint = sunTintWeights(surface.sunFacing, config)
    grass = mix(grass, p.grassLight, tint.toward)
    grass = mix(grass, coolGrass(surface.ambientSky, config), tint.away)
    grass = scale(
      rotateHue(grass, surface.macro * b.macroHueDegrees),
      1 + surface.macroValue * b.macroValue,
    )
  }
  let c = mix(grass, p.sand, w.sand)
  c = mix(c, p.rock, w.rock)
  if (surface) {
    const strata =
      smoothstep(b.strataRockWeight, b.strataRockWeight + 0.2, w.rock) *
      (1 - smoothstep(b.strataFadeStart, b.strataFadeEnd, surface.distance))
    c = scale(
      c,
      1 +
        b.strataValue * Math.sin(2 * Math.PI * strataPhase(height, surface.macro, config)) * strata,
    )
  }
  c = mix(c, p.snow, w.snow)
  if (surface) {
    const brush = 1 - smoothstep(b.brushFadeStart, b.brushFadeEnd, surface.distance)
    c = scale(c, 1 + b.brushValue * surface.brush * brush)
  }
  return mix(c, mix(p.waterShallow, p.waterDeep, w.waterDepth), w.water)
}
