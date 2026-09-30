import type { ControlPhase } from '../app/controlStateMachine'

export type TeachingVisualPhase = 'hidden' | 'visible' | 'exiting'

export interface PauseTeachingState {
  seenActive: boolean
  taught: boolean
  visual: TeachingVisualPhase
  exitStartedMs: number
}

export interface PauseTeachingFrame {
  eligible: boolean
  game: 'flying' | 'paused' | string
  controlPhase: ControlPhase
  controlSinceMs: number
  nowMs: number
  reducedMotion: boolean
}

export interface PauseTeachingView {
  state: PauseTeachingState
  shown: boolean
  suppressControlPrompt: boolean
  progress: number
}

export function createPauseTeachingState(): PauseTeachingState {
  return { seenActive: false, taught: false, visual: 'hidden', exitStartedMs: 0 }
}

/** Pure visual handoff layered over the control machine. It never owns pause timing. */
export function stepPauseTeaching(
  previous: PauseTeachingState,
  frame: PauseTeachingFrame,
  fadeMs: number,
  pauseAfterMs: number,
): PauseTeachingView {
  const seenActive = previous.seenActive || frame.controlPhase === 'active'
  const taught = previous.taught || (seenActive && frame.game === 'paused')
  const wantsVisible =
    frame.eligible &&
    frame.game === 'flying' &&
    seenActive &&
    !taught &&
    frame.controlPhase === 'inactive'

  let visual = previous.visual
  let exitStartedMs = previous.exitStartedMs
  if (wantsVisible) {
    visual = 'visible'
  } else if (visual === 'visible' && !frame.reducedMotion) {
    visual = 'exiting'
    exitStartedMs = frame.nowMs
  } else if (
    frame.reducedMotion ||
    (visual === 'exiting' && frame.nowMs - exitStartedMs >= fadeMs)
  ) {
    visual = 'hidden'
  }

  const progress = wantsVisible
    ? Math.min(1, Math.max(0, (frame.nowMs - frame.controlSinceMs) / pauseAfterMs))
    : 0

  return {
    state: { seenActive, taught, visual, exitStartedMs },
    shown: visual === 'visible',
    // Hold the ordinary prompt until this prompt has completely faded away.
    suppressControlPrompt: visual !== 'hidden',
    progress,
  }
}
