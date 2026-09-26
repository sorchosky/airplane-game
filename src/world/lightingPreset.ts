import {
  DEFAULT_LIGHTING_PRESET,
  lightingPresets,
  type LightingPreset,
  type LightingPresetName,
} from '../styles/tokens'

/**
 * Which lighting preset the world uses (#64): `morning` by default, `?tod=golden` for golden hour.
 * Read once per page load. The day cycle (#92) will drive the lighting uniforms directly instead.
 */
const TOD_ALIASES: Record<string, LightingPresetName> = {
  morning: 'morning',
  golden: 'goldenHour',
  'golden-hour': 'goldenHour',
  goldenhour: 'goldenHour',
}

export function getTimeOfDayFromUrl(search: string): LightingPresetName {
  const value = new URLSearchParams(search).get('tod')?.toLowerCase() ?? ''
  return TOD_ALIASES[value] ?? DEFAULT_LIGHTING_PRESET
}

let active: LightingPreset | null = null

/** The preset this page load renders with. */
export function activeLighting(): LightingPreset {
  if (!active) {
    const search = typeof window === 'undefined' ? '' : window.location.search
    active = lightingPresets[getTimeOfDayFromUrl(search)]
  }
  return active
}
