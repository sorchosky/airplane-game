import { DEFAULT_CALIBRATION, type Calibration } from './calibration'
import { DEFAULT_GESTURE_PARAMS, measureArms, type GestureParams } from './gesture'
import { LANDMARK, type PoseLandmark, type PoseLandmarks } from './types'

/**
 * Hands-free calibration, as a pure step function fed one pose detection at a time. The player
 * walks into frame, spreads their arms and holds still; the averaged pose over the hold becomes
 * their neutral. All values are in mirrored, normalized image space (see `types.ts`).
 */

export interface CalibrationParams {
  /** Visibility (0..1) required on each shoulder and hip for the distance check. */
  minBodyVisibility: number
  /**
   * Shoulder distance as a fraction of frame width. Below the minimum the player is too far for
   * reliable landmarks; above the maximum their outstretched arms won't fit in frame.
   */
  minShoulderWidth: number
  maxShoulderWidth: number
  /** Steady arms-out time needed to capture a new calibration. */
  holdMs: number
  /** Shorter steady hold that reuses a saved calibration when the pose still matches it. */
  skipHoldMs: number
  /** How far the held pose may drift from the saved neutral and still reuse it. */
  skipRollToleranceDeg: number
  skipPitchTolerance: number
  /** Standard deviations over the hold above which the player counts as moving (hold resets). */
  maxRollStdDeg: number
  maxPitchStd: number
  /** Shoulder width std as a fraction of its mean (walking toward or away from the camera). */
  maxShoulderWidthRelStd: number
  gesture: GestureParams
}

export const DEFAULT_CALIBRATION_PARAMS: CalibrationParams = {
  minBodyVisibility: 0.5,
  minShoulderWidth: 0.07,
  maxShoulderWidth: 0.2,
  holdMs: 2000,
  skipHoldMs: 1000,
  skipRollToleranceDeg: 6,
  skipPitchTolerance: 0.15,
  maxRollStdDeg: 5,
  maxPitchStd: 0.12,
  maxShoulderWidthRelStd: 0.1,
  gesture: DEFAULT_GESTURE_PARAMS,
}

export type BodyCheck = 'noPerson' | 'tooClose' | 'tooFar' | 'ok'

export type CalibrationPhase = Exclude<BodyCheck, 'ok'> | 'armsNotOut' | 'holding' | 'done'

interface HoldSamples {
  rollDeg: number[]
  pitchRatio: number[]
  shoulderWidth: number[]
}

export interface CalibrationFlowState {
  phase: CalibrationPhase
  /** Detection time (ms) the current steady hold started, or null when not holding. */
  holdStartMs: number | null
  samples: HoldSamples
  /** Set once `phase` is `done`: either a fresh calibration or the reused saved one. */
  result: Calibration | null
  /** Whether `result` is the saved calibration (skip path) rather than a new capture. */
  reusedSaved: boolean
}

const EMPTY_SAMPLES: HoldSamples = { rollDeg: [], pitchRatio: [], shoulderWidth: [] }

export const INITIAL_CALIBRATION_FLOW: CalibrationFlowState = {
  phase: 'noPerson',
  holdStartMs: null,
  samples: EMPTY_SAMPLES,
  result: null,
  reusedSaved: false,
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Population standard deviation. 0 for fewer than two values. */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length)
}

function inFrameAndVisible(point: PoseLandmark | undefined, minVisibility: number): boolean {
  return (
    point !== undefined &&
    point.visibility >= minVisibility &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  )
}

/**
 * Is the player framed well enough to calibrate? Shoulders must be visible (else no person),
 * hips must be visible too (else too close), and the shoulder distance must sit in range.
 */
export function checkBody(
  landmarks: PoseLandmarks | null,
  params: CalibrationParams = DEFAULT_CALIBRATION_PARAMS,
): BodyCheck {
  if (!landmarks) return 'noPerson'
  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER]
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER]
  if (
    !leftShoulder ||
    !rightShoulder ||
    !inFrameAndVisible(leftShoulder, params.minBodyVisibility) ||
    !inFrameAndVisible(rightShoulder, params.minBodyVisibility)
  ) {
    return 'noPerson'
  }

  const hipsVisible =
    inFrameAndVisible(landmarks[LANDMARK.LEFT_HIP], params.minBodyVisibility) &&
    inFrameAndVisible(landmarks[LANDMARK.RIGHT_HIP], params.minBodyVisibility)
  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y,
  )

  if (!hipsVisible || shoulderWidth > params.maxShoulderWidth) return 'tooClose'
  if (shoulderWidth < params.minShoulderWidth) return 'tooFar'
  return 'ok'
}

function isSteady(samples: HoldSamples, params: CalibrationParams): boolean {
  const widthMean = mean(samples.shoulderWidth)
  return (
    stdDev(samples.rollDeg) <= params.maxRollStdDeg &&
    stdDev(samples.pitchRatio) <= params.maxPitchStd &&
    (widthMean <= 0 || stdDev(samples.shoulderWidth) / widthMean <= params.maxShoulderWidthRelStd)
  )
}

export function averageCalibration(samples: HoldSamples): Calibration {
  return {
    neutralRollDeg: mean(samples.rollDeg),
    neutralPitch: mean(samples.pitchRatio),
    shoulderWidth: mean(samples.shoulderWidth),
  }
}

/** Whether a held pose is close enough to a saved neutral to keep using it. */
export function matchesSaved(
  held: Calibration,
  saved: Calibration,
  params: CalibrationParams = DEFAULT_CALIBRATION_PARAMS,
): boolean {
  return (
    Math.abs(held.neutralRollDeg - saved.neutralRollDeg) <= params.skipRollToleranceDeg &&
    Math.abs(held.neutralPitch - saved.neutralPitch) <= params.skipPitchTolerance
  )
}

function notHolding(phase: CalibrationPhase): CalibrationFlowState {
  return { ...INITIAL_CALIBRATION_FLOW, phase }
}

/**
 * Advances the calibration flow by one detection. Call once per new detection with its time.
 * `saved` is a previously stored calibration, or null. `done` is terminal.
 */
export function stepCalibration(
  state: CalibrationFlowState,
  landmarks: PoseLandmarks | null,
  tMs: number,
  saved: Calibration | null,
  params: CalibrationParams = DEFAULT_CALIBRATION_PARAMS,
): CalibrationFlowState {
  if (state.phase === 'done') return state

  const body = checkBody(landmarks, params)
  if (body !== 'ok') return notHolding(body)

  const arms = measureArms(landmarks, DEFAULT_CALIBRATION.shoulderWidth, params.gesture)
  if (!arms?.outstretched) return notHolding('armsNotOut')

  const appended: HoldSamples = {
    rollDeg: [...state.samples.rollDeg, arms.rollDeg],
    pitchRatio: [...state.samples.pitchRatio, arms.pitchRatio],
    shoulderWidth: [...state.samples.shoulderWidth, arms.shoulderWidth],
  }

  // Starting a hold, or the player moved: restart the hold from this frame.
  if (state.holdStartMs === null || !isSteady(appended, params)) {
    return {
      ...INITIAL_CALIBRATION_FLOW,
      phase: 'holding',
      holdStartMs: tMs,
      samples: {
        rollDeg: [arms.rollDeg],
        pitchRatio: [arms.pitchRatio],
        shoulderWidth: [arms.shoulderWidth],
      },
    }
  }

  const elapsedMs = tMs - state.holdStartMs
  const held = averageCalibration(appended)

  if (saved && elapsedMs >= params.skipHoldMs && matchesSaved(held, saved, params)) {
    return { ...state, phase: 'done', samples: appended, result: saved, reusedSaved: true }
  }
  if (elapsedMs >= params.holdMs) {
    return { ...state, phase: 'done', samples: appended, result: held, reusedSaved: false }
  }
  return { ...state, samples: appended }
}

/**
 * 0..1 progress of the current hold, for the progress ring. Measured against the shorter skip
 * hold while the pose still matches the saved calibration, so the ring fills at the pace the
 * player will actually finish at.
 */
export function holdProgress(
  state: CalibrationFlowState,
  tMs: number,
  saved: Calibration | null,
  params: CalibrationParams = DEFAULT_CALIBRATION_PARAMS,
): number {
  if (state.phase === 'done') return 1
  if (state.phase !== 'holding' || state.holdStartMs === null) return 0
  const target =
    saved && matchesSaved(averageCalibration(state.samples), saved, params)
      ? params.skipHoldMs
      : params.holdMs
  return Math.min(1, Math.max(0, (tMs - state.holdStartMs) / target))
}
