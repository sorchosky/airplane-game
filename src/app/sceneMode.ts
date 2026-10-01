import type { GameState } from './gameStore'

/**
 * How the persistent world behaves (#153). `attract`: the plane is parked, the sim doesn't step, no
 * input source feeds it and no HUD, prompts or touch controls render. `flight`: the normal sim.
 */
export type SceneMode = 'attract' | 'flight'

/** The world is flown from `wings` on; every state before it (and the error screen) is attract. */
export function sceneModeFor(state: GameState): SceneMode {
  return state === 'wings' || state === 'flying' || state === 'paused' ? 'flight' : 'attract'
}

/**
 * Whether the world is on screen behind the UI. Calibrate and error cover it with an opaque
 * preview or scrim, so the attract frame holds there and the GPU is left to pose detection.
 */
export function worldIsVisible(state: GameState): boolean {
  return state !== 'calibrate' && state !== 'error'
}
