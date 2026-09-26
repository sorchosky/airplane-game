/**
 * Pose detection rate under load (#65). Pure. When inference takes longer than `slowMs` the
 * detector steps down 20 → 15 → 12 Hz, never lower; once it is back under `fastMs` for
 * `recoverMs` it steps up again.
 */
import { DETECTION_HZ } from './poseFrame'

export const DETECTION_RATES_HZ = [DETECTION_HZ, 15, 12] as const

export interface DetectionRateParams {
  slowMs: number
  fastMs: number
  /** How long inference must stay slow (or fast) before the rate changes. */
  settleMs: number
  recoverMs: number
}

export const DEFAULT_DETECTION_RATE_PARAMS: DetectionRateParams = {
  slowMs: 40,
  fastMs: 25,
  settleMs: 2000,
  recoverMs: 10_000,
}

export interface DetectionRateState {
  /** Index into `DETECTION_RATES_HZ`. */
  step: number
  slowSinceMs: number | null
  fastSinceMs: number | null
}

export const INITIAL_DETECTION_RATE: DetectionRateState = {
  step: 0,
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
  const slow = inferenceMs > params.slowMs
  const fast = inferenceMs < params.fastMs
  const slowSinceMs = slow ? (state.slowSinceMs ?? nowMs) : null
  const fastSinceMs = fast ? (state.fastSinceMs ?? nowMs) : null

  if (slow && nowMs - (slowSinceMs ?? nowMs) >= params.settleMs) {
    if (state.step < DETECTION_RATES_HZ.length - 1) {
      return { step: state.step + 1, slowSinceMs: null, fastSinceMs: null }
    }
  }
  if (fast && state.step > 0 && nowMs - (fastSinceMs ?? nowMs) >= params.recoverMs) {
    return { step: state.step - 1, slowSinceMs: null, fastSinceMs: null }
  }
  if (slowSinceMs === state.slowSinceMs && fastSinceMs === state.fastSinceMs) return state
  return { ...state, slowSinceMs, fastSinceMs }
}

export function detectionIntervalMs(state: DetectionRateState): number {
  return 1000 / (DETECTION_RATES_HZ[state.step] ?? DETECTION_RATES_HZ[0])
}
