import type { ControlInput } from './types'

export type InputSourceName = ControlInput['source']

const VALID_SOURCES: readonly InputSourceName[] = ['keyboard', 'pose', 'replay']

/**
 * Reads the `?input=` URL flag. Defaults to `pose`, the real game: with no flag the title screen
 * sends the player through camera calibration, so anything else would calibrate them and then
 * ignore their body. Keyboard is opt-in with `?input=keyboard`, which must always work in dev.
 */
export function getInputSourceFromUrl(search: string = window.location.search): InputSourceName {
  const value = new URLSearchParams(search).get('input')
  return (VALID_SOURCES as readonly string[]).includes(value ?? '')
    ? (value as InputSourceName)
    : 'pose'
}

/** `?debug` enables the perf HUD and pose/input debug readouts across the app. */
export function hasDebugFlag(search: string = window.location.search): boolean {
  return new URLSearchParams(search).has('debug')
}
