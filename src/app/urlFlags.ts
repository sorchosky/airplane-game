// Small URL-flag reader shared across dev/testing entry points.

import { selectedInputSource } from './controlModeStore'

/**
 * Whether Start skips the camera and calibration. Derived from the same `?input=` reader the input
 * store uses, so the screen flow and the source steering the plane can never disagree.
 */
export function isKeyboardInputMode(): boolean {
  return selectedInputSource() === 'keyboard'
}

/**
 * `?input=replay`: a recorded pose fixture stands in for the camera and MediaPipe, so the app
 * must not open the camera or load the model.
 */
export function isReplayInputMode(): boolean {
  return selectedInputSource() === 'replay'
}

/** `?swatches` renders the design token review page instead of the game. */
export function isSwatchesMode(): boolean {
  return new URLSearchParams(window.location.search).has('swatches')
}

/** `?scene=materials` renders the toon material demo scene instead of the game. */
export function isMaterialsSceneMode(): boolean {
  return new URLSearchParams(window.location.search).get('scene') === 'materials'
}

/** `?map[=<km>]` replaces the game with the world-authoring map. Up to 48 km: two world periods. */
export function mapSizeKm(): number | null {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('map')) return null
  const value = Number(params.get('map'))
  return Number.isFinite(value) && value > 0 ? Math.min(48, Math.max(1, value)) : 16
}

/**
 * `?curve=<km>`: the horizon bend spike (#178), the radius in metres of the world the ground
 * appears to curve over, or null when off (the default). Clamped to 5..1000 km.
 */
export function horizonCurveRadius(search: string = window.location.search): number | null {
  const value = Number(new URLSearchParams(search).get('curve'))
  return Number.isFinite(value) && value > 0 ? Math.min(1000, Math.max(5, value)) * 1000 : null
}
