import type { LightingPreset } from '../styles/tokens'
import type { QualityTier } from './qualityStore'

// Post-processing tunables. Values act on the scene as it would appear on the canvas (tone
// mapped, linear), so thresholds line up with what's on screen. Re-check bloom whenever the
// plane, terrain or water colours change.

export const POST_FX = {
  bloom: {
    /**
     * Linear luminance where bloom starts (#64). The morning sky is pale: its horizon is about
     * 0.8 and the glow around the sun about 0.85, so the threshold sits above both. Only the sun
     * disc, which the sky draws at 3x white in this buffer (`Sky.tsx`), clears it.
     */
    threshold: 0.9,
    /** Soft knee above the threshold, so highlights fade in rather than pop */
    smoothing: 0.06,
    intensity: 0.6,
    /** Mipmap blur spread, 0..1 */
    radius: 0.6,
  },
  grade: {
    /**
     * Luma-preserving saturation boost, +4 % (#72). The shadow and highlight tints and their
     * amounts are per time of day, in `lightingPresets` (`gradeShadow`, `gradeHighlight`).
     */
    saturation: 0.04,
  },
  vignette: {
    offset: 0.4,
    darkness: 0.25,
  },
  /**
   * God rays toward the sun on `high` (#72): a screen-space radial blur of the sky mask (pixels
   * with nothing drawn over the sky dome) weighted by a glow around the sun, so terrain and
   * clouds in front of the sun cut dark shafts through it.
   */
  godRays: {
    /** Taps along each pixel's ray toward the sun. Jittered per pixel, so 24 doesn't band. */
    samples: 24,
    /** How much of the way to the sun a pixel's ray reaches, 0..1 */
    length: 0.85,
    /** Per-tap falloff, so far taps count less and shafts fade out from the sun */
    decay: 0.96,
    /** Radius of the glow that feeds the rays, in screen heights */
    glowRadius: 0.3,
    /** Added light at full strength, in the linear buffer. Subtle: a hint of shafts, not a haze. */
    strength: 0.18,
  },
  /**
   * MSAA samples for the composer's scene buffer. The canvas's own antialiasing is bypassed when
   * post is on, and 4 matches what browsers typically give the canvas.
   */
  multisampling: 4,
} as const

export interface PostFxConfig {
  /** Whether the composer runs at all. When false the scene renders straight to the canvas. */
  enabled: boolean
  /** Bloom resolution relative to the canvas */
  bloomResolutionScale: number
  grade: boolean
  vignette: boolean
  godRays: boolean
}

export interface PostFxOptions {
  /** `prefers-reduced-motion: reduce`: god rays sweep across the screen as the plane turns. */
  reducedMotion?: boolean
}

/**
 * What each quality tier draws. `high` is the hero tier; `medium` is bloom only and `low` draws
 * straight to the canvas. The grade keeps luma, so the governor's tier steps don't shift the
 * frame's brightness (`gradeColor`).
 */
export function postFxConfig(tier: QualityTier, options: PostFxOptions = {}): PostFxConfig {
  switch (tier) {
    case 'low':
      return {
        enabled: false,
        bloomResolutionScale: 0.5,
        grade: false,
        vignette: false,
        godRays: false,
      }
    case 'medium':
      return {
        enabled: true,
        bloomResolutionScale: 0.5,
        grade: false,
        vignette: false,
        godRays: false,
      }
    case 'high':
      return {
        enabled: true,
        bloomResolutionScale: 1,
        grade: true,
        vignette: true,
        godRays: !options.reducedMotion,
      }
  }
}

export type Rgb = readonly [number, number, number]

/** Grade inputs for one time of day, display sRGB 0..1. Built by `gradeParams`. */
export interface GradeParams {
  shadowTint: Rgb
  highlightTint: Rgb
  shadowAmount: number
  highlightAmount: number
  saturation: number
}

/** Rec. 709 luma weights, applied to display sRGB like an image editor does. */
export const LUMA: Rgb = [0.2126, 0.7152, 0.0722]

export const luma = (c: Rgb): number => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function gradeParams(lighting: LightingPreset): GradeParams {
  return {
    shadowTint: hexToRgb(lighting.gradeShadow),
    highlightTint: hexToRgb(lighting.gradeHighlight),
    shadowAmount: lighting.gradeShadowAmount,
    highlightAmount: lighting.gradeHighlightAmount,
    saturation: POST_FX.grade.saturation,
  }
}

/**
 * The two-tone grade on one display sRGB colour, mirroring `WarmLiftEffect`'s shader (keep the
 * two in step). Darks lean toward the shadow tint's hue and brights toward the highlight tint's,
 * then saturation rises around the pixel's luma. Each step adds only a zero-luma offset, so the
 * pixel's luma is unchanged until the final clamp.
 */
export function gradeColor(color: Rgb, p: GradeParams): Rgb {
  const l = luma(color)
  const shadowWeight = p.shadowAmount * (1 - l) * (1 - l)
  const highlightWeight = p.highlightAmount * l * l
  // Zero-luma offsets: each tint minus its own luma.
  const shadowLuma = luma(p.shadowTint)
  const highlightLuma = luma(p.highlightTint)
  const channel = (c: number, shadow: number, highlight: number): number => {
    const toned =
      c + shadowWeight * (shadow - shadowLuma) + highlightWeight * (highlight - highlightLuma)
    return Math.min(1, Math.max(0, l + (toned - l) * (1 + p.saturation)))
  }
  const [s, h] = [p.shadowTint, p.highlightTint]
  return [
    channel(color[0], s[0], h[0]),
    channel(color[1], s[1], h[1]),
    channel(color[2], s[2], h[2]),
  ]
}

/**
 * Brightness factor of postprocessing's default vignette at a screen UV, mirroring its shader
 * (`VignetteEffect`, technique DEFAULT), so tests can measure how much it darkens the frame.
 */
export function vignetteFactor(u: number, v: number, offset: number, darkness: number): number {
  const d = Math.hypot(u - 0.5, v - 0.5)
  const x = d * (darkness + offset)
  const edge0 = 0.8
  const edge1 = offset * 0.799
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * How strongly the god rays draw, 0..1, from where the sun sits relative to the view.
 * `forwardDotSun` is the cosine between the camera's forward and the sun direction; `sunU`,
 * `sunV` are the sun's screen UV (0..1 on screen). Rays fade out as the sun swings behind the
 * camera or well past the screen edge, so they never pop in or out as the plane turns.
 */
export function godRayFade(forwardDotSun: number, sunU: number, sunV: number): number {
  const facing = smoothstep(0.05, 0.45, forwardDotSun)
  const offscreen = Math.max(Math.abs(sunU - 0.5), Math.abs(sunV - 0.5))
  return facing * (1 - smoothstep(0.5, 1.1, offscreen))
}
