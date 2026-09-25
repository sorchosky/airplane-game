// Design tokens. Single source of truth for the palette, spacing, type ramp,
// toon ramp and lighting constants — every M3+ ticket pulls from here so the
// BotW-inspired look stays consistent. See docs/art-direction.md for the
// rationale behind each choice.
//
// `tokens.css` mirrors the same values as CSS custom properties for
// non-Three.js UI. `tokens.test.ts` asserts the two stay in sync.

// Colors are plain hex/rgba strings, which `new THREE.Color(...)` and
// `<color args={[...]} />` accept directly — no wrapper needed to be
// "Three.js Color-ready". Palette target: a warm, low-contrast sunset —
// muted and painterly, not saturated/cartoony.
export const color = {
  // Sky and atmosphere
  skyZenith: '#5c5b74',
  skyHorizon: '#e7a878',
  fog: '#e3bd9a',
  sun: '#f8b968',

  // Terrain
  grassLight: '#b7a35e',
  grassShadow: '#6d5a3a',
  rock: '#a3907b',
  snow: '#f6ead9',
  waterShallow: '#7fa79c',
  waterDeep: '#39525a',
  foliage: '#5f6b41',

  // Cel-shading linework
  outline: '#2a2219',

  // Plane livery (cream body, warm terracotta stripe, muted metal)
  planeBody: '#f1e7d4',
  planeStripe: '#c2572f',
  planeMetal: '#a99b89',

  // Gesture-control state (muted teal-cyan, not neon, so it reads as a
  // deliberate system color against the warm palette rather than clashing)
  controlActive: '#5cb8bd',
  controlInactive: '#8a7c6c',

  // UI
  surfaceHud: 'rgba(36, 27, 21, 0.8)',
  textPrimary: '#f3e8d8',
  textMuted: '#cdbca6',
  accent: '#5cb8bd',
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
  trackingDisplay: '0.14em',
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

// Lighting constants shared by every material/scene ticket in M3.
export const lighting = {
  // World-space direction the sun shines FROM: low on the horizon for a
  // golden-hour/sunset mood (small Y, large horizontal component), rather
  // than a high overhead noon sun. #22 owns normalizing and animating this.
  sunDirection: [0.85, 0.28, 0.35] as const,
  rimStrength: 0.4,
} as const
