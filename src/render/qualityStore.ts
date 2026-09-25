import { create } from 'zustand'

/**
 * Render quality tier. `low` skips post-processing entirely, `medium` is a half-resolution bloom
 * only, `high` is bloom plus the colour grade and vignette. #27 will switch tiers automatically
 * from measured frame time; for now the tier is picked once at load.
 */
export type QualityTier = 'low' | 'medium' | 'high'

const TIERS: readonly QualityTier[] = ['low', 'medium', 'high']

/**
 * Reads the `?fx=off|low|medium|high` testing override. `off` is an alias for `low`. Returns
 * `null` when the flag is absent or unrecognised, so the device default applies.
 */
export function getFxFlag(search: string = window.location.search): QualityTier | null {
  const value = new URLSearchParams(search).get('fx')
  if (value === 'off') return 'low'
  return (TIERS as readonly string[]).includes(value ?? '') ? (value as QualityTier) : null
}

/** Phones and tablets also run pose detection and screen mirroring, so they start a tier lower. */
export function defaultQualityTier(isMobile: boolean): QualityTier {
  return isMobile ? 'medium' : 'high'
}

/** A coarse primary pointer means a touch device. Touchscreen laptops still report `fine`. */
function isMobileDevice(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

function initialTier(): QualityTier {
  if (typeof window === 'undefined') return 'high'
  return getFxFlag() ?? defaultQualityTier(isMobileDevice())
}

interface QualityStore {
  tier: QualityTier
  setTier: (tier: QualityTier) => void
}

export const useQualityStore = create<QualityStore>((set) => ({
  tier: initialTier(),
  setTier: (tier) => set({ tier }),
}))
