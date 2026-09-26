// Design tokens. Single source of truth for the palette, spacing, type ramp,
// toon ramp and lighting constants — every M3+ ticket pulls from here so the
// BotW-inspired look stays consistent. See docs/art-direction.md for the
// rationale behind each choice.
//
// `tokens.css` mirrors the same values as CSS custom properties for
// non-Three.js UI. `tokens.test.ts` asserts the two stay in sync.

// Colors are plain hex/rgba strings, which `new THREE.Color(...)` and
// `<color args={[...]} />` accept directly — no wrapper needed to be
// "Three.js Color-ready".
//
// Two groups (#64, `docs/art-bible.md` §3): `color` holds albedo, the colour a surface *is*, which
// never changes with the time of day, plus the UI. How the world is *lit* lives in
// `lightingPresets` below: sky, haze, sun and ambient. Palette B, "Hyrule morning", chosen by the
// owner on 2026-09-26 (#88).
export const color = {
  // Terrain albedo
  grassLight: '#93b352',
  grassShadow: '#567c3b',
  sand: '#d9c89c',
  rock: '#9b9486',
  rockShadow: '#6e685e',
  snow: '#f5f6f8',
  waterShallow: '#6fc0c8',
  waterDeep: '#2f6d8c',
  foliage: '#3f7d46',
  foliageLight: '#6da356',
  bark: '#6b5442',

  // Cel-shading linework: a cool near-black, so outlines read as ink rather than brown.
  outline: '#1f2a33',

  // Plane livery: warm white body, safety-orange stripe, warm grey metal.
  planeBody: '#f4efe3',
  planeStripe: '#d8562b',
  planeMetal: '#9c948a',
  // Cabin window band and tires: a cool, dark slate tint.
  planeGlass: '#35414d',

  // Gesture-control state (muted teal-cyan, not neon, so it reads as a
  // deliberate system color against the warm palette rather than clashing).
  // Whether the player's gesture is currently steering the plane.
  controlActive: '#5cb8bd',
  controlInactive: '#8a7c6c',

  // UI
  surfaceHud: 'rgba(36, 27, 21, 0.8)',
  // Opaque `surfaceHud`, for full-screen blockers that must hide everything behind them.
  surfaceScrim: '#241b15',
  textPrimary: '#f3e8d8',
  textMuted: '#cdbca6',
  accent: '#5cb8bd',

  // Title screen (Figma "Driftwing" storyboard). The sky colors are the Figma "Golden hour
  // cirrus" shader's palette pre-mixed at the title's time-of-day, so `TitleSky` only blends
  // three sky stops and two cloud tones.
  titleSkyTop: '#285799',
  titleSkyMid: '#978bad',
  titleSkyLow: '#fd9e55',
  titleCloudWarm: '#ffb988',
  titleCloudCool: '#bab5cc',
  titleText: '#e4e9f6',
  titleTextShadow: '#2c4781',
  titleStartBorder: 'rgba(228, 233, 246, 0.7)',
} as const

// 8pt spacing scale.
export const space = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  xxxl: '64px',
} as const

// TV type scale, sized to stay legible from a couch (~10 ft / 3 m from a
// 55" TV). `tvBody` is the minimum size used for any body text (CLAUDE.md:
// "Minimum body text is the tv-body token").
//
// `fontDisplay` is reserved for the logo and section headers (mirroring
// BotW's own UI, which is Helvetica-like everywhere except those); every
// other UI element — buttons, body copy, captions — uses `fontBody`. Sizes
// lean smaller/tighter than a typical "hero game title" ramp, in keeping
// with a mid-century poster's restraint; the main title makes up the
// difference with `trackingDisplay` and uppercase rather than sheer size.
export const type = {
  fontDisplay: '"Josefin Sans", sans-serif',
  fontBody: '"Work Sans", system-ui, sans-serif',
  // Explicit weights so the browser never has to synthesize a bold from an
  // unloaded weight (tokens.css only loads the weights below).
  weightDisplay: 600,
  weightButton: 500,
  // Title screen: Josefin at regular weight for the wordmark, Work Sans semibold for Start.
  weightHero: 400,
  weightStart: 600,
  trackingDisplay: '0.14em',
  // Wordmark tracking, its offset shadow's (wider, so it reads as cast onto the clouds) and
  // Start's, all as the Figma ratios (28.8 / 33.6 / 4.2 px at 48 / 48 / 14 px).
  trackingHero: '0.6em',
  trackingHeroShadow: '0.7em',
  trackingStart: '0.3em',
  // The wordmark: 48px on the 874px-wide Figma frame, capped for large TVs.
  tvHero: 'clamp(2.5rem, 5.5vw, 6rem)',
  tvDisplay: 'clamp(2.5rem, 4.5vw, 4rem)',
  tvTitle: 'clamp(1.75rem, 3vw, 2.5rem)',
  tvBody: 'clamp(1.5rem, 2vw, 1.875rem)',
  tvCaption: 'clamp(1.125rem, 1.5vw, 1.375rem)',
} as const

// Toon shading ramp: N-dot-L thresholds that split lighting into flat bands
// instead of a smooth gradient. Two thresholds → 3 bands (shadow / mid /
// highlight), matching BotW's soft 2-3 step cel shading. `edgeSoftness` is
// the smoothstep half-width at each threshold so band edges anti-alias
// instead of aliasing into jaggies.
export const toonRamp = {
  steps: 3,
  thresholds: [0.3, 0.65] as const,
  edgeSoftness: 0.05,
} as const

/**
 * How the world is lit at one time of day (#64). Sky and haze colours are display sRGB (the sky and
 * the haze are written after tone mapping); `sun` and the ambient colours light the scene. Every
 * value reaches the shaders as a uniform (`atmosphereUniforms.ts`), so the day cycle (#92) can blend
 * two presets per frame without recompiling.
 */
export interface LightingPreset {
  /** Sky straight up. */
  skyZenith: string
  /** Sky at the horizon toward the sun; away from the sun it leans toward the zenith. */
  skyHorizon: string
  /** The soft halo around the sun, separate from the sun's light so the sky can stay pale. */
  sunGlow: string
  /** Near haze over the first few hundred metres: cool and pale by day (aerial perspective). */
  fog: string
  /** The sun's light on the world. */
  sun: string
  /** Hemisphere fill from above: the sky colour that lifts shadowed faces. */
  ambientSky: string
  /** Hemisphere fill from below: grass-bounced light. */
  ambientGround: string
  /** Sunlit and shadowed cloud tones. */
  cloudLight: string
  cloudShadow: string
  /** World-space direction the sun shines FROM, not normalized. */
  sunDirection: readonly [number, number, number]
  sunIntensity: number
  hemisphereIntensity: number
  /**
   * Two-tone colour grade on `high` (#72), display sRGB: the hue shadows lean toward (teal) and
   * the hue highlights lean toward (warm). Only their hue and saturation move pixels; the grade
   * keeps each pixel's luma, so tiers match in brightness.
   */
  gradeShadow: string
  gradeHighlight: string
  /** How far shadows and highlights lean toward their grade tints, 0..1 */
  gradeShadowAmount: number
  gradeHighlightAmount: number
}

export const lightingPresets = {
  /**
   * The default: cerulean sky fading to a pale horizon, cool haze, a warm cream sun at about 34°
   * elevation (the audit's 41° flattened the relief, `docs/art-bible.md` §3).
   */
  morning: {
    skyZenith: '#3f7fc4',
    skyHorizon: '#d5e6f0',
    sunGlow: '#ffe6bd',
    fog: '#bfd3e2',
    sun: '#fff2d2',
    ambientSky: '#8fb4de',
    ambientGround: '#6b7a52',
    cloudLight: '#fbfaf5',
    cloudShadow: '#b9c3d6',
    sunDirection: [0.6, 0.52, 0.49] as const,
    sunIntensity: 2.4,
    hemisphereIntensity: 0.9,
    // The sky already carries the cool side, so highlights warm only a little.
    gradeShadow: '#2f8a8c',
    gradeHighlight: '#ffcf96',
    gradeShadowAmount: 0.25,
    gradeHighlightAmount: 0.15,
  },
  /** Low warm sun, peach horizon, violet zenith: `?tod=golden`, and the approach to dusk in #92. */
  goldenHour: {
    skyZenith: '#566a9c',
    skyHorizon: '#f3c08f',
    sunGlow: '#ffc27a',
    fog: '#e8cdb0',
    sun: '#ffd48a',
    ambientSky: '#8a8fb8',
    ambientGround: '#7a6a4a',
    cloudLight: '#fff1dc',
    cloudShadow: '#b8a4bd',
    sunDirection: [0.85, 0.28, 0.35] as const,
    sunIntensity: 2.2,
    hemisphereIntensity: 1.0,
    // Already warm: keep the teal shadows for contrast and barely warm the highlights further.
    gradeShadow: '#2f8a8c',
    gradeHighlight: '#ffc58a',
    gradeShadowAmount: 0.25,
    gradeHighlightAmount: 0.08,
  },
} as const satisfies Record<string, LightingPreset>

export type LightingPresetName = keyof typeof lightingPresets

export const DEFAULT_LIGHTING_PRESET: LightingPresetName = 'morning'

// Lighting constants that don't change with the time of day.
export const lighting = {
  rimStrength: 0.4,
} as const

// Corner radii.
export const radius = {
  sharp: '2px',
} as const

// HUD element sizing, relative to viewport so it scales with the TV.
export const size = {
  cameraPreviewWidth: '20vw',
  // Larger preview while calibrating, so the player can line themselves up from ~2 m.
  cameraPreviewWidthLarge: '44vw',
  // Calibration silhouette and progress ring.
  calibrationFigure: 'clamp(160px, 18vw, 240px)',
} as const
