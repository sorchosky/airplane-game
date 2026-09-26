import type { QualityTier } from './qualityStore'

// Post-processing tunables. Values act on the scene as it would appear on the canvas (tone
// mapped, linear), so thresholds line up with what's on screen. Re-check bloom whenever the
// plane, terrain or water colours change.

export const POST_FX = {
  bloom: {
    /**
     * Linear luminance where bloom starts. Measured in-game: the sun disc is ~0.84 and the sky
     * glow around the sun ~0.45–0.50, which clear this; the rest of the sky (~0.38), sunlit
     * terrain and the plane (~0.25) do not, and outlines (~0.01) never get close, so the
     * linework stays crisp.
     */
    threshold: 0.42,
    /** Soft knee above the threshold, so highlights fade in rather than pop */
    smoothing: 0.08,
    intensity: 0.6,
    /** Mipmap blur spread, 0..1 */
    radius: 0.6,
  },
  grade: {
    /** How far shadows lift toward the warm `sun` tint, 0..1 */
    lift: 0.06,
    /** HueSaturation saturation, -1..1 */
    saturation: 0.06,
  },
  vignette: {
    offset: 0.35,
    darkness: 0.38,
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
}

export function postFxConfig(tier: QualityTier): PostFxConfig {
  switch (tier) {
    case 'low':
      return { enabled: false, bloomResolutionScale: 0.5, grade: false, vignette: false }
    case 'medium':
      return { enabled: true, bloomResolutionScale: 0.5, grade: false, vignette: false }
    case 'high':
      return { enabled: true, bloomResolutionScale: 1, grade: true, vignette: true }
  }
}
