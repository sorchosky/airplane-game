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

  // Fishing town (#224, art bible §2). Whitewashed walls and umber framing, two roofs, a weathered
  // pier, and the warm light that comes on in the windows at dusk. #235 reuses `roofTerracotta`.
  wallLime: '#e4e8cc',
  timber: '#5c4030',
  roofTerracotta: '#c0623d',
  roofSlate: '#456c74',
  pierGrey: '#8d8a83',
  dirtRoad: '#b08f62',
  windowGlass: '#3c4d56',
  windowGlow: '#ffb459',

  // Cel-shading linework: a cool near-black, so outlines read as ink rather than brown.
  outline: '#1f2a33',
  // Landscape linework is quieter than the aircraft silhouette and leans toward foliage shadow.
  foliageOutline: '#29383a',
  planeOutlineDay: '#1e2b33',
  // A restrained neutral lift for the darkest hours, not a luminous blue halo. The plane-specific
  // token keeps its animated material isolated from cached foliage and landmark outlines.
  planeOutlineNight: '#51565a',

  // Plane livery: warm white body, safety-orange stripe, warm grey metal. The wheel pants take a
  // step darker trim and the struts a darker metal so the undercarriage separates from the wing
  // and body in silhouette (#71).
  planeBody: '#f4efe3',
  planeStripe: '#d8562b',
  planeTrim: '#d6cfc1',
  planeMetal: '#857e75',
  // Cabin window band and tires: a cool, dark slate tint.
  planeGlass: '#35414d',
  navRed: '#ff4050',
  navGreen: '#57ffc0',
  navWhite: '#f5faff',
  // Wingtip vortex vapour: a cool near-white, like the snow, tinted by the material's alpha.
  vapor: '#eef3f7',
  dust: '#b9a67c',
  spray: '#d9f2f2',

  // Gesture-control state (muted teal-cyan, not neon, so it reads as a
  // deliberate system color against the warm palette rather than clashing).
  // Whether the player's gesture is currently steering the plane.
  controlActive: '#5cb8bd',
  controlInactive: '#8e9aa6',

  // UI
  // Multi-line copy keeps the denser alpha required for AA; one-line HUD elements use glow alone.
  surfaceHud: 'rgba(12, 18, 26, 0.8)',
  surfaceScrim: 'rgba(12, 18, 26, 0.6)',
  // The control choice's scrim, applied in the render pipeline over the blurred world (#159). 70 %
  // is the least that keeps the accent corner marks at 3:1 over the brightest world colour.
  frontDoorScrim: 'rgba(12, 18, 26, 0.7)',
  // Portrait prompt (#155): a cool tint with no desaturation, and the page colour behind it so
  // the iOS status bar strip matches.
  orientationScrim: 'rgba(24, 36, 64, 0.72)',
  orientationBackdrop: '#182440',
  surfaceSolid: 'rgb(12, 18, 26)',
  textPrimary: '#f7f4ec',
  textMuted: '#cfd6dc',
  accent: '#58c3c9',
  // Hairline chrome and the calibration target silhouette (`docs/art-bible.md` UI tokens).
  line: 'rgba(247, 244, 236, 0.55)',
  glow: 'rgba(12, 18, 26, 0.6)',
  // The one white flash of the skeleton at calibration lock-in (#63).
  lockFlash: '#ffffff',

  // Title screen (Figma "Driftwing" storyboard). The sky colors are the Figma "Golden hour
  // cirrus" shader's palette pre-mixed at the title's time-of-day, so `TitleSky` only blends
  // three sky stops and two cloud tones.
  titleSkyTop: '#285799',
  titleSkyMid: '#978bad',
  titleSkyLow: '#fd9e55',
  titleCloudWarm: '#ffb988',
  titleCloudCool: '#bab5cc',
  titleText: '#e4e9f6',
  titleStartBorder: 'rgba(228, 233, 246, 0.7)',
  // #73: the warm white the intro fades up from. #229: the deep-blue tint used by the title's
  // local vignette and shadows. Keeping the tint opaque here lets effects own their alpha.
  titleFade: '#fff4e6',
  titleVignette: 'rgb(27, 39, 72)',
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
  // Tracking for the paused and golden-path heroes, and for Start (Figma ratios 28.8 / 4.2 px at
  // 48 / 14 px). The title wordmark itself uses `trackingDisplay`.
  trackingHero: '0.6em',
  trackingStart: '0.3em',
  // The wordmark: 48px on the 874px-wide Figma frame, capped for large TVs.
  tvHero: 'clamp(2.5rem, 5.5vw, 6rem)',
  tvDisplay: 'clamp(2.5rem, 4.5vw, 4rem)',
  tvTitle: 'clamp(1.75rem, 3vw, 2.5rem)',
  tvBody: 'clamp(1.5rem, 2vw, 1.875rem)',
  tvCaption: 'clamp(1.125rem, 1.5vw, 1.375rem)',
  // `?debug` readouts only. They sit over a phone-sized canvas, so they are not TV text.
  debugCaption: 'clamp(0.625rem, 1.1vw, 0.875rem)',
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
  day: {
    skyZenith: '#388bd0',
    skyHorizon: '#dceef6',
    sunGlow: '#fff0d3',
    fog: '#c8ddec',
    sun: '#fff8e9',
    ambientSky: '#9bc5ec',
    ambientGround: '#70855a',
    cloudLight: '#ffffff',
    cloudShadow: '#becfe0',
    sunDirection: [0.25, 0.95, 0.3],
    sunIntensity: 2.5,
    hemisphereIntensity: 1.0,
    gradeShadow: '#358f9a',
    gradeHighlight: '#ffe0b5',
    gradeShadowAmount: 0.2,
    gradeHighlightAmount: 0.1,
  },
  afternoon: {
    skyZenith: '#4e84bb',
    skyHorizon: '#e5dfd0',
    sunGlow: '#ffe1ae',
    fog: '#d5d9d6',
    sun: '#ffe5b6',
    ambientSky: '#93afd2',
    ambientGround: '#77805a',
    cloudLight: '#fff8ea',
    cloudShadow: '#bcbaca',
    sunDirection: [0.75, 0.55, 0.35],
    sunIntensity: 2.35,
    hemisphereIntensity: 0.95,
    gradeShadow: '#398889',
    gradeHighlight: '#ffd19a',
    gradeShadowAmount: 0.23,
    gradeHighlightAmount: 0.13,
  },
  dusk: {
    skyZenith: '#3b4b84',
    skyHorizon: '#e6a47c',
    sunGlow: '#ffb477',
    fog: '#bca7af',
    sun: '#ffc08c',
    ambientSky: '#777da9',
    ambientGround: '#555774',
    cloudLight: '#ead1bf',
    cloudShadow: '#786d92',
    sunDirection: [0.88, 0.12, 0.42],
    sunIntensity: 1.55,
    hemisphereIntensity: 0.85,
    gradeShadow: '#368094',
    gradeHighlight: '#ffc28d',
    gradeShadowAmount: 0.27,
    gradeHighlightAmount: 0.08,
  },
  /** The key direction is the moon at night. The blue fill keeps the plane and ground legible. */
  night: {
    skyZenith: '#182c52',
    skyHorizon: '#425b83',
    sunGlow: '#a9c2e8',
    fog: '#344f75',
    sun: '#b6d5f5',
    ambientSky: '#9bbce0',
    ambientGround: '#61799b',
    cloudLight: '#8ca7ce',
    cloudShadow: '#486289',
    sunDirection: [-0.6, 0.75, 0.4],
    sunIntensity: 1.25,
    hemisphereIntensity: 1.0,
    gradeShadow: '#426b9c',
    gradeHighlight: '#e8cdbc',
    gradeShadowAmount: 0.15,
    gradeHighlightAmount: 0.04,
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

// Frost and glow shared by the lightweight HUD chrome (#79).
export const effect = {
  hudBlur: 'blur(12px)',
  scrimBlur: 'blur(16px) saturate(80%)',
  tintBlur: 'blur(16px)',
  // The low tier's frozen world still (#159): blurred once, 20 % desaturated, never a backdrop filter.
  stillBlur: 'blur(8px) saturate(80%)',
  textGlow: `0 0 12px ${color.glow}`,
  ringGlow: `drop-shadow(0 0 6px ${color.glow})`,
  // Local title contrast without a rectangular plate. The narrow horizontal radius clears the
  // plane on phone viewports while the tall falloff stays natural around the centred masthead.
  titleVignette: `radial-gradient(ellipse 24vw 70vh at calc(max(${space.xxxl}, env(safe-area-inset-left)) + 11vw) 46%, rgba(27, 39, 72, 0.36) 0%, rgba(27, 39, 72, 0.20) 40%, rgba(27, 39, 72, 0.06) 72%, rgba(27, 39, 72, 0) 100%)`,
  titleTextShadow: '0 1px 2px rgba(27, 39, 72, 0.45), 0 0 24px rgba(27, 39, 72, 0.35)',
  titleOutlineShadow: '0 0 16px rgba(27, 39, 72, 0.30)',
} as const

export const motion = {
  promptFadeMs: 400,
  // Portrait prompt phone turn (#155): rotate, then hold in landscape.
  rotateCueTurnMs: 1200,
  rotateCueHoldMs: 1000,
  promptFadeEase: 'ease',
  // Control choice (#154): the corner marks slide `space.sm` inward over this.
  frameSlideMs: 200,
} as const

// HUD element sizing, relative to viewport so it scales with the TV.
export const size = {
  cameraPreviewWidth: '20vw',
  // Celestial dial (#166): about 12vh at 1080p, bounded for small phones and large TVs.
  sunMoonDial: 'clamp(104px, 12vh, 168px)',
  // The calibrate preview's frame (#63): a cool edge the player can find from ~2 m.
  calibrateFrame: '12px',
  // Title pose demonstration (arms out, tilt, arms up) under Start.
  // Calibration hold-progress ring, beside the one line of guidance.
  holdRing: 'clamp(40px, 4vw, 56px)',
  // Control choice (#154): the glyph box (bounded by height too, so both frames fit a landscape
  // phone), the glyph stroke at about 1.2% of the box width as in the owner's mockup (the SVG
  // strokes use `vector-effect: non-scaling-stroke`), and the corner marks' hairline.
  controlGlyph: 'clamp(160px, min(24vw, 48vh), 480px)',
  glyphStroke: 'clamp(2px, min(0.29vw, 0.58vh), 6px)',
  frameStroke: '2px',
  glyphTrailStroke: '1px',
  cornerArm: '24px',
} as const
