// Placeholder design tokens. #20 (art direction doc) refines the palette.

export const color = {
  sky: '#7ec8e3',
  ground: '#3f7d4a',
  accent: '#ff8c42',
  textPrimary: '#1a2330',
  textOnDark: '#f5f7fa',
  surfaceHud: 'rgba(11, 18, 32, 0.6)',
  // Semantic control-state roles: whether the player's gesture is currently steering the plane.
  controlActive: '#3ddc84',
  controlInactive: 'rgba(245, 247, 250, 0.45)',
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

// TV type scale, sized to stay legible from a couch (~10 ft).
export const type = {
  tvDisplay: 'clamp(3rem, 6vw, 6rem)',
  tvTitle: 'clamp(2rem, 4vw, 3.5rem)',
  tvBody: 'clamp(1.25rem, 2.2vw, 2rem)',
  tvCaption: 'clamp(1rem, 1.6vw, 1.5rem)',
} as const

// HUD element sizing, relative to viewport so it scales with the TV.
export const size = {
  cameraPreviewWidth: '20vw',
} as const
