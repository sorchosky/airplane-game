import type { ControlInput } from '../input/types'
import { clamp, clampAxis } from '../input/clamp'
import { DEFAULT_CALIBRATION, type Calibration } from './calibration'
import {
  createOneEuroState,
  DEFAULT_ONE_EURO_PARAMS,
  oneEuroFilter,
  type OneEuroParams,
  type OneEuroState,
} from './oneEuro'
import { LANDMARK, type PoseLandmark, type PoseLandmarks } from './types'

/**
 * Turns pose landmarks into `ControlInput`. Pure: no DOM, React or MediaPipe runtime imports.
 *
 * Landmarks must already be in mirrored (selfie) space: x grows from screen-left to screen-right
 * as the player sees the preview, so a real tilt to the player's right (right wrist sinking)
 * produces a positive roll (bank right). The pose service is responsible for that mirroring.
 */

export interface GestureParams {
  /** Elbow must be at least this straight, in degrees, to count as "outstretched". */
  minElbowAngleDeg: number
  /** Wrist-to-wrist distance must exceed this multiple of the live shoulder width. */
  minWristSpanRatio: number
  /** Landmark visibility (0..1) required, averaged over both arms, for the gate to consider engaging. */
  minVisibility: number
  /** Continuous time the gate condition must hold before `active` turns on. */
  engageMs: number
  /** Grace period the gate condition may be false before `active` turns back off. */
  disengageGraceMs: number
  /** Degrees of wrist-line tilt around neutral that map to zero roll. */
  rollDeadzoneDeg: number
  /** Degrees of wrist-line tilt (past the deadzone) that map to full roll. */
  rollFullScaleDeg: number
  /** Exponent applied after the linear deadzone/scale mapping for a softer center, firmer edges. */
  rollResponseExponent: number
  /** Wrist-height-over-shoulder-width ratio around neutral that maps to zero pitch. */
  pitchDeadzoneRatio: number
  /** Ratio (past the deadzone) that maps to full pitch. */
  pitchFullScaleRatio: number
  oneEuro: OneEuroParams
}

export const DEFAULT_GESTURE_PARAMS: GestureParams = {
  minElbowAngleDeg: 150,
  minWristSpanRatio: 1.5,
  minVisibility: 0.5,
  engageMs: 300,
  disengageGraceMs: 500,
  rollDeadzoneDeg: 4,
  rollFullScaleDeg: 35,
  rollResponseExponent: 1.4,
  pitchDeadzoneRatio: 0.05,
  pitchFullScaleRatio: 0.6,
  oneEuro: DEFAULT_ONE_EURO_PARAMS,
}

export interface GestureState {
  active: boolean
  /** Timestamp (ms) the raw gate condition most recently became continuously true, or null. */
  conditionSincePassedMs: number | null
  /** Timestamp (ms) the raw gate condition most recently became continuously false, or null. */
  conditionSinceFailedMs: number | null
  rollFilter: OneEuroState
  pitchFilter: OneEuroState
}

export const DEFAULT_GESTURE_STATE: GestureState = {
  active: false,
  conditionSincePassedMs: null,
  conditionSinceFailedMs: null,
  rollFilter: createOneEuroState(),
  pitchFilter: createOneEuroState(),
}

export interface InterpretPoseResult {
  input: ControlInput
  state: GestureState
}

function distance(a: PoseLandmark, b: PoseLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Angle at `vertex`, in degrees, between the rays toward `a` and `b`. 180 = perfectly straight. */
function angleAtVertexDeg(a: PoseLandmark, vertex: PoseLandmark, b: PoseLandmark): number {
  const v1x = a.x - vertex.x
  const v1y = a.y - vertex.y
  const v2x = b.x - vertex.x
  const v2y = b.y - vertex.y
  const mag1 = Math.hypot(v1x, v1y)
  const mag2 = Math.hypot(v2x, v2y)
  if (mag1 === 0 || mag2 === 0) return 0
  const cos = clamp((v1x * v2x + v1y * v2y) / (mag1 * mag2), -1, 1)
  return (Math.acos(cos) * 180) / Math.PI
}

function getLandmark(landmarks: PoseLandmarks, index: number): PoseLandmark | undefined {
  return landmarks[index]
}

interface ArmLandmarks {
  leftShoulder: PoseLandmark
  rightShoulder: PoseLandmark
  leftElbow: PoseLandmark
  rightElbow: PoseLandmark
  leftWrist: PoseLandmark
  rightWrist: PoseLandmark
}

function getArmLandmarks(landmarks: PoseLandmarks | null): ArmLandmarks | null {
  if (!landmarks) return null
  const leftShoulder = getLandmark(landmarks, LANDMARK.LEFT_SHOULDER)
  const rightShoulder = getLandmark(landmarks, LANDMARK.RIGHT_SHOULDER)
  const leftElbow = getLandmark(landmarks, LANDMARK.LEFT_ELBOW)
  const rightElbow = getLandmark(landmarks, LANDMARK.RIGHT_ELBOW)
  const leftWrist = getLandmark(landmarks, LANDMARK.LEFT_WRIST)
  const rightWrist = getLandmark(landmarks, LANDMARK.RIGHT_WRIST)
  if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !leftWrist || !rightWrist) {
    return null
  }
  return { leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist }
}

/** Linear deadzone + scale to -1..1. Sign-preserving. */
function mapAxisLinear(raw: number, deadzone: number, fullScale: number): number {
  const magnitude = Math.abs(raw)
  if (magnitude <= deadzone) return 0
  const span = Math.max(1e-6, fullScale - deadzone)
  const scaled = Math.min(1, (magnitude - deadzone) / span)
  return Math.sign(raw) * scaled
}

function updateGate(
  conditionMet: boolean,
  state: GestureState,
  tMs: number,
  params: GestureParams,
): Pick<GestureState, 'active' | 'conditionSincePassedMs' | 'conditionSinceFailedMs'> {
  if (conditionMet) {
    const sincePassedMs = state.conditionSincePassedMs ?? tMs
    const active = state.active || tMs - sincePassedMs >= params.engageMs
    return { active, conditionSincePassedMs: sincePassedMs, conditionSinceFailedMs: null }
  }

  const sinceFailedMs = state.conditionSinceFailedMs ?? tMs
  const active = state.active && tMs - sinceFailedMs < params.disengageGraceMs
  return { active, conditionSincePassedMs: null, conditionSinceFailedMs: sinceFailedMs }
}

export function interpretPose(
  landmarks: PoseLandmarks | null,
  calibration: Calibration = DEFAULT_CALIBRATION,
  state: GestureState = DEFAULT_GESTURE_STATE,
  tMs: number,
  params: GestureParams = DEFAULT_GESTURE_PARAMS,
): InterpretPoseResult {
  const arms = getArmLandmarks(landmarks)

  if (!arms) {
    const gate = updateGate(false, state, tMs, params)
    return {
      input: { roll: 0, pitch: 0, active: gate.active, confidence: 0, source: 'pose' },
      state: { ...state, ...gate },
    }
  }

  const { leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist } = arms

  const shoulderWidth = distance(leftShoulder, rightShoulder) || calibration.shoulderWidth
  const wristSpan = distance(leftWrist, rightWrist)
  const wristSpanRatio = wristSpan / shoulderWidth

  const leftElbowAngle = angleAtVertexDeg(leftShoulder, leftElbow, leftWrist)
  const rightElbowAngle = angleAtVertexDeg(rightShoulder, rightElbow, rightWrist)

  const visibilities = [
    leftShoulder.visibility,
    rightShoulder.visibility,
    leftElbow.visibility,
    rightElbow.visibility,
    leftWrist.visibility,
    rightWrist.visibility,
  ]
  const meanVisibility = visibilities.reduce((sum, v) => sum + v, 0) / visibilities.length

  const conditionMet =
    leftElbowAngle >= params.minElbowAngleDeg &&
    rightElbowAngle >= params.minElbowAngleDeg &&
    wristSpanRatio >= params.minWristSpanRatio &&
    meanVisibility >= params.minVisibility

  const gate = updateGate(conditionMet, state, tMs, params)

  const rollDegRaw =
    (Math.atan2(rightWrist.y - leftWrist.y, rightWrist.x - leftWrist.x) * 180) / Math.PI
  const pitchRatioRaw =
    ((leftShoulder.y + rightShoulder.y) / 2 - (leftWrist.y + rightWrist.y) / 2) / shoulderWidth

  const { value: rollDeg, state: rollFilter } = oneEuroFilter(
    rollDegRaw,
    tMs,
    state.rollFilter,
    params.oneEuro,
  )
  const { value: pitchRatio, state: pitchFilter } = oneEuroFilter(
    pitchRatioRaw,
    tMs,
    state.pitchFilter,
    params.oneEuro,
  )

  const rollLinear = mapAxisLinear(
    rollDeg - calibration.neutralRollDeg,
    params.rollDeadzoneDeg,
    params.rollFullScaleDeg,
  )
  const roll = Math.sign(rollLinear) * Math.pow(Math.abs(rollLinear), params.rollResponseExponent)

  const pitch = mapAxisLinear(
    pitchRatio - calibration.neutralPitch,
    params.pitchDeadzoneRatio,
    params.pitchFullScaleRatio,
  )

  return {
    input: {
      roll: clampAxis(roll),
      pitch: clampAxis(pitch),
      active: gate.active,
      confidence: clamp(meanVisibility, 0, 1),
      source: 'pose',
    },
    state: { ...gate, rollFilter, pitchFilter },
  }
}
