import { create } from 'zustand'
import { TERRAIN_CONFIG } from '../world/terrainConfig'

/**
 * Render quality tier. `low` skips post-processing entirely, `medium` is a half-resolution bloom
 * only, `high` is bloom plus the colour grade and vignette. The starting tier comes from the device;
 * from there the frame-time governor (`adaptiveQuality.ts`, #65) moves it with the other rungs.
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

export interface QualityChange {
  direction: 'down' | 'up'
  /** What the new rung changed, e.g. `dpr 1` or `post medium`. */
  label: string
  atMs: number
}

interface QualityStore {
  tier: QualityTier
  /** Renderer pixel ratio the governor asked for. */
  dpr: number
  /** 0..1, share of foliage drawn. Read by the foliage slice (A3). */
  foliageDensity: number
  /** m, terrain build distance the governor asked for; the streamer applies it on a chunk crossing. */
  viewDistance: number
  /** m, the view distance the terrain streamer is actually using. The far haze follows this. */
  appliedViewDistance: number
  /** Governor rung, 0 = best looking, and how many there are. */
  rung: number
  rungCount: number
  /** True when `?fx=` pins the tier and the governor stays off. */
  pinned: boolean
  lastChange: QualityChange | null
  setTier: (tier: QualityTier) => void
}

export const useQualityStore = create<QualityStore>((set) => ({
  tier: initialTier(),
  dpr: 1,
  foliageDensity: 1,
  viewDistance: TERRAIN_CONFIG.viewDistance,
  appliedViewDistance: TERRAIN_CONFIG.viewDistance,
  rung: 0,
  rungCount: 1,
  pinned: typeof window !== 'undefined' && getFxFlag() !== null,
  lastChange: null,
  setTier: (tier) => set({ tier }),
}))
