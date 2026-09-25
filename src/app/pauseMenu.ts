/**
 * Pause menu navigation (#28). Pure: no React, DOM or store imports.
 *
 * Hands-free: with arms out, tilt past `tiltThreshold` to move the highlight one item in that
 * direction. The tilt has to come back inside `levelThreshold` before it can move again, so one
 * lean is one step. Holding arms out and level for `holdMs` selects the highlighted item. Anything
 * that isn't a level hold (arms down, leaning) restarts the hold.
 *
 * Keyboard and touch go through `movePauseMenu` and select directly.
 */

export type PauseMenuItem = 'resume' | 'recalibrate' | 'quit'

export interface PauseMenuState {
  /** Index of the highlighted item. */
  index: number
  /** Direction of the tilt that last moved the highlight, until the player levels out again. */
  tilt: -1 | 0 | 1
  /** `nowMs` the current level hold started, or null when not holding. */
  holdStartMs: number | null
}

export interface PauseMenuInput {
  /** `ControlInput.active`: arms out and tracked. */
  active: boolean
  /** `ControlInput.roll`, -1 (bank left) .. 1 (bank right). */
  roll: number
  nowMs: number
}

export interface PauseMenuParams {
  /** |roll| at or past this moves the highlight. */
  tiltThreshold: number
  /** |roll| under this counts as level: re-arms the tilt and lets the hold run. */
  levelThreshold: number
  /** Level arms-out hold that selects the highlighted item. */
  holdMs: number
}

export const DEFAULT_PAUSE_MENU_PARAMS: PauseMenuParams = {
  tiltThreshold: 0.5,
  levelThreshold: 0.2,
  holdMs: 1500,
}

export const INITIAL_PAUSE_MENU: PauseMenuState = { index: 0, tilt: 0, holdStartMs: null }

export interface PauseMenuStepResult {
  state: PauseMenuState
  /** Index of the item selected this frame, else null. */
  selected: number | null
}

function clampIndex(index: number, count: number): number {
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0))
}

/** Moves the highlight by `delta` items, stopping at the ends (no wrap, so a long lean is safe). */
export function movePauseMenu(state: PauseMenuState, delta: number, count: number): PauseMenuState {
  const index = clampIndex(state.index + delta, count)
  return index === state.index && state.holdStartMs === null
    ? state
    : { ...state, index, holdStartMs: null }
}

/**
 * Advances gesture navigation by one frame over a menu of `count` items. Returns the same `state`
 * object when nothing changed, so callers can skip re-renders cheaply.
 */
export function stepPauseMenu(
  state: PauseMenuState,
  input: PauseMenuInput,
  count: number,
  params: PauseMenuParams = DEFAULT_PAUSE_MENU_PARAMS,
): PauseMenuStepResult {
  const unchanged: PauseMenuStepResult = { state, selected: null }
  const { active, roll, nowMs } = input

  if (!active) {
    return state.tilt === 0 && state.holdStartMs === null
      ? unchanged
      : { state: { ...state, tilt: 0, holdStartMs: null }, selected: null }
  }

  const direction = roll >= params.tiltThreshold ? 1 : roll <= -params.tiltThreshold ? -1 : 0
  if (direction !== 0) {
    if (direction === state.tilt) {
      return state.holdStartMs === null
        ? unchanged
        : { state: { ...state, holdStartMs: null }, selected: null }
    }
    const moved = movePauseMenu(state, direction, count)
    return { state: { ...moved, tilt: direction, holdStartMs: null }, selected: null }
  }

  if (Math.abs(roll) >= params.levelThreshold) {
    // Between level and a full tilt: not a hold, and not yet re-armed for another step.
    return state.holdStartMs === null
      ? unchanged
      : { state: { ...state, holdStartMs: null }, selected: null }
  }

  if (state.holdStartMs === null) {
    return { state: { ...state, tilt: 0, holdStartMs: nowMs }, selected: null }
  }
  if (nowMs - state.holdStartMs >= params.holdMs) {
    return { state: { ...state, tilt: 0, holdStartMs: null }, selected: state.index }
  }
  return state.tilt === 0 ? unchanged : { state: { ...state, tilt: 0 }, selected: null }
}

/** Hold progress 0..1 for the fill ring. */
export function pauseMenuHoldProgress(
  state: PauseMenuState,
  nowMs: number,
  params: PauseMenuParams = DEFAULT_PAUSE_MENU_PARAMS,
): number {
  if (state.holdStartMs === null) return 0
  return Math.min(Math.max((nowMs - state.holdStartMs) / params.holdMs, 0), 1)
}
