// Small URL-flag reader shared across dev/testing entry points.

import { getInputSourceFromUrl } from '../input/source'

/**
 * Whether Start skips the camera and calibration. Derived from the same `?input=` reader the input
 * store uses, so the screen flow and the source steering the plane can never disagree.
 */
export function isKeyboardInputMode(): boolean {
  return getInputSourceFromUrl() === 'keyboard'
}

/** `?swatches` renders the design token review page instead of the game. */
export function isSwatchesMode(): boolean {
  return new URLSearchParams(window.location.search).has('swatches')
}

/** `?scene=materials` renders the toon material demo scene instead of the game. */
export function isMaterialsSceneMode(): boolean {
  return new URLSearchParams(window.location.search).get('scene') === 'materials'
}
