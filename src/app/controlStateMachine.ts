/**
 * Control-state timing: turns the per-frame "is the player steering?" signal into HUD prompts,
 * hands-free pause and a resume countdown. Pure: no React, DOM or store imports.
 *
 * Phases:
 * - `active`    the player is steering.
 * - `inactive`  arms down or out of frame; autopilot flies. A prompt shows after `promptDelayMs`,
 *               and after `pauseAfterMs` the game pauses (when `gesturePause` is on).
 * - `paused`    the sim is frozen and the pause menu (#28) is up. The menu owns the arms-out hold
 *               and calls `startCountdown` when the player picks Resume.
 * - `countdown` 3-2-1, still paused. Arms down cancels it back to `paused`.
 *
 * Keyboard mode turns `gesturePause` off: Esc (`togglePause`) is the only way in and out of pause,
 * but resuming still goes through the countdown.
 */

export type ControlPhase = 'active' | 'inactive' | 'paused' | 'countdown'

export interface ControlMachineState {
  phase: ControlPhase
  /** `nowMs` the current phase started at. */
  sinceMs: number
}

export interface ControlMachineInput {
  /** `ControlInput.active` for this frame. */
  active: boolean
  nowMs: number
}

export interface ControlMachineParams {
  /** Inactive this long before the "spread your arms" prompt appears. */
  promptDelayMs: number
  /** Inactive this long before the game pauses. */
  pauseAfterMs: number
  /** Countdown length; one tick per second. */
  countdownMs: number
  /** Whether arms down/out drive pause and resume. Off in keyboard mode. */
  gesturePause: boolean
}

export const DEFAULT_CONTROL_MACHINE_PARAMS: ControlMachineParams = {
  promptDelayMs: 300,
  pauseAfterMs: 5000,
  countdownMs: 3000,
  gesturePause: true,
}

/** What the caller must tell the game state machine, if anything. */
export type ControlCommand = 'pause' | 'resume' | null

export interface ControlStepResult {
  state: ControlMachineState
  command: ControlCommand
}

export function createControlMachineState(nowMs: number): ControlMachineState {
  return { phase: 'inactive', sinceMs: nowMs }
}

function enter(phase: ControlPhase, nowMs: number, command: ControlCommand = null) {
  return { state: { phase, sinceMs: nowMs }, command }
}

/**
 * Advances the machine by one frame. Returns the same `state` object when nothing changed, so
 * callers can skip store writes cheaply.
 */
export function stepControlMachine(
  state: ControlMachineState,
  input: ControlMachineInput,
  params: ControlMachineParams = DEFAULT_CONTROL_MACHINE_PARAMS,
): ControlStepResult {
  const { active, nowMs } = input
  const elapsed = nowMs - state.sinceMs
  const unchanged: ControlStepResult = { state, command: null }

  switch (state.phase) {
    case 'active':
      return active ? unchanged : enter('inactive', nowMs)

    case 'inactive':
      if (active) return enter('active', nowMs)
      if (params.gesturePause && elapsed >= params.pauseAfterMs) {
        return enter('paused', nowMs, 'pause')
      }
      return unchanged

    case 'paused':
      return unchanged

    case 'countdown':
      if (params.gesturePause && !active) return enter('paused', nowMs)
      if (elapsed >= params.countdownMs) {
        return enter(active ? 'active' : 'inactive', nowMs, 'resume')
      }
      return unchanged
  }
}

/**
 * Manual pause toggle (Esc in keyboard mode). Flying pauses at once; paused starts the countdown;
 * a running countdown cancels back to paused.
 */
export function togglePause(state: ControlMachineState, nowMs: number): ControlStepResult {
  switch (state.phase) {
    case 'active':
    case 'inactive':
      return enter('paused', nowMs, 'pause')
    case 'paused':
      return enter('countdown', nowMs)
    case 'countdown':
      return enter('paused', nowMs)
  }
}

/** Resume picked from the pause menu: paused starts the countdown, anything else is unchanged. */
export function startCountdown(state: ControlMachineState, nowMs: number): ControlStepResult {
  return state.phase === 'paused' ? enter('countdown', nowMs) : { state, command: null }
}

/**
 * Pause from outside the player's control (the phone turned to portrait). Flying pauses, a running
 * countdown drops back to paused, and paused stays paused.
 */
export function forcePause(state: ControlMachineState, nowMs: number): ControlStepResult {
  switch (state.phase) {
    case 'active':
    case 'inactive':
      return enter('paused', nowMs, 'pause')
    case 'countdown':
      return enter('paused', nowMs)
    case 'paused':
      return { state, command: null }
  }
}

export type ControlPrompt = 'spread-arms' | 'step-into-view' | null

export interface ControlView {
  /** HUD prompt shown over the flight scene. Null while steering, paused, or inside the delay. */
  prompt: ControlPrompt
  /** Whether the sim is frozen (the game should be in `paused`). */
  paused: boolean
  /** 3, 2, 1 during the resume countdown, else null. */
  countdown: number | null
}

/** Derives what the HUD shows. `personInFrame` picks between the two inactive prompts. */
export function controlView(
  state: ControlMachineState,
  nowMs: number,
  personInFrame: boolean,
  params: ControlMachineParams = DEFAULT_CONTROL_MACHINE_PARAMS,
): ControlView {
  const elapsed = nowMs - state.sinceMs
  const showPrompt = state.phase === 'inactive' && elapsed >= params.promptDelayMs
  const countdownSeconds = Math.ceil(params.countdownMs / 1000)

  return {
    prompt: showPrompt ? (personInFrame ? 'spread-arms' : 'step-into-view') : null,
    paused: state.phase === 'paused' || state.phase === 'countdown',
    countdown:
      state.phase === 'countdown'
        ? Math.max(1, countdownSeconds - Math.floor(elapsed / 1000))
        : null,
  }
}
