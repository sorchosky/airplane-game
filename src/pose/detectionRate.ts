/**
 * Pose detection rate under load (#65, #66). Pure. Detection starts at 20 Hz. It climbs to 30 Hz
 * only on a device where inference fits in a small share of a 30 Hz frame, and steps down
 * 20 → 15 → 12 Hz, never lower, when inference is slow. Each change waits for the condition to
 * hold: `settleMs` to step down, `recoverMs` to climb.
 */
import { DETECTION_HZ } from './poseFrame'

export interface DetectionRung {
  hz: number
  /** Smoothed inference above this (ms), for `settleMs`, steps down from this rung. */
  stepDownAboveMs: number
  /** Smoothed inference below this (ms), for `recoverMs`, climbs to this rung from the one below. */
  climbToBelowMs: number
}

/**
 * 30 Hz only while inference stays under 40 % of its 33 ms frame, climbed to below 25 %: inference
 * runs on the main thread, and a phone at 30 Hz with 25 ms inference would lose three quarters of
 * it. Below 20 Hz the #65 rule stands: step down over 40 ms, recover under 25 ms.
 */
export const DETECTION_RUNGS: readonly DetectionRung[] = [
  { hz: 30, stepDownAboveMs: 13, climbToBelowMs: 8 },
  { hz: DETECTION_HZ, stepDownAboveMs: 40, climbToBelowMs: 25 },
  { hz: 15, stepDownAboveMs: 40, climbToBelowMs: 25 },
  { hz: 12, stepDownAboveMs: Infinity, climbToBelowMs: 25 },
]

export const DETECTION_RATES_HZ = DETECTION_RUNGS.map((rung) => rung.hz)

export interface DetectionRateParams {
  /** How long inference must stay slow before the rate steps down. */
  settleMs: number
  /** How long inference must stay fast before the rate climbs. */
  recoverMs: number
}

export const DEFAULT_DETECTION_RATE_PARAMS: DetectionRateParams = {
  settleMs: 2000,
  recoverMs: 10_000,
}

export interface DetectionRateState {
  /** Index into `DETECTION_RUNGS`. */
  step: number
  slowSinceMs: number | null
  fastSinceMs: number | null
}

/** Starts at 20 Hz: 30 Hz has to be earned by measured inference. */
export const INITIAL_DETECTION_RATE: DetectionRateState = {
  step: 1,
  slowSinceMs: null,
  fastSinceMs: null,
}

/** Feeds the smoothed inference time after each detection. Same object back when unchanged. */
export function stepDetectionRate(
  state: DetectionRateState,
  inferenceMs: number,
  nowMs: number,
  params: DetectionRateParams = DEFAULT_DETECTION_RATE_PARAMS,
): DetectionRateState {
  const here = DETECTION_RUNGS[state.step]
  const above = DETECTION_RUNGS[state.step - 1]
  const slow = here !== undefined && inferenceMs > here.stepDownAboveMs
  const fast = above !== undefined && inferenceMs < above.climbToBelowMs
  const slowSinceMs = slow ? (state.slowSinceMs ?? nowMs) : null
  const fastSinceMs = fast ? (state.fastSinceMs ?? nowMs) : null

  if (slow && nowMs - (slowSinceMs ?? nowMs) >= params.settleMs) {
    if (state.step < DETECTION_RUNGS.length - 1) {
      return { step: state.step + 1, slowSinceMs: null, fastSinceMs: null }
    }
  }
  if (fast && nowMs - (fastSinceMs ?? nowMs) >= params.recoverMs) {
    return { step: state.step - 1, slowSinceMs: null, fastSinceMs: null }
  }
  if (slowSinceMs === state.slowSinceMs && fastSinceMs === state.fastSinceMs) return state
  return { ...state, slowSinceMs, fastSinceMs }
}

export function detectionIntervalMs(state: DetectionRateState): number {
  return 1000 / (DETECTION_RUNGS[state.step]?.hz ?? DETECTION_HZ)
}
