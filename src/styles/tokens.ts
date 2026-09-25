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
export const color = {
  // Sky and atmosphere
  skyZenith: '#3d76ad',
  skyHorizon: '#cfe8ee',
  fog: '#b7d6da',
  sun: '#ffd873',

  // Terrain
  grassLight: '#a8c34d',
  grassShadow: '#4f6b2c',
  rock: '#8d8577',
  snow: '#f4f8fb',
  waterShallow: '#6fd1c8',
  waterDeep: '#1f5c73',
  foliage: '#3f6e3b',

  // Cel-shading linework
  outline: '#20241f',

  // Plane livery (cream body, warm red-orange stripe, muted metal)
  planeBody: '#f2e9d8',
  planeStripe: '#d9552c',
  planeMetal: '#9aa0a6',

  // Gesture-control state
  controlActive: '#3fd6e6',
  controlInactive: '#5b6570',

  // UI
  surfaceHud: 'rgba(13, 20, 33, 0.78)',
  textPrimary: '#f5f3ec',
  textMuted: '#b9c2ca',
  accent: '#3fd6e6',
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
export const type = {
  fontDisplay: '"Cinzel", serif',
  fontBody: '"Inter", system-ui, sans-serif',
  tvDisplay: 'clamp(3rem, 6vw, 6rem)',
  tvTitle: 'clamp(2rem, 4vw, 3.5rem)',
  tvBody: 'clamp(1.5rem, 2.4vw, 2rem)',
  tvCaption: 'clamp(1.125rem, 1.8vw, 1.5rem)',
} as const

// Toon shading ramp: N-dot-L thresholds that split lighting into flat bands
// instead of a smooth gradient. Two thresholds → 3 bands (shadow / mid /
// highlight), matching BotW's soft 2-3 step cel shading. `edgeSoftness` is
// the smoothstep half-width at each threshold so band edges anti-alias
// instead of aliasing into jaggies.
export const toonRamp = {
  steps: 3,
  thresholds: [0.25, 0.6] as const,
  edgeSoftness: 0.04,
} as const

// Lighting constants shared by every material/scene ticket in M3.
export const lighting = {
  // World-space direction the sun shines FROM, roughly matching a low
  // afternoon sun over the player's left shoulder. #22 owns normalizing and
  // animating this.
  sunDirection: [0.35, 0.82, 0.45] as const,
  rimStrength: 0.35,
} as const
