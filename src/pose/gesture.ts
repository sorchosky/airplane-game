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
  /**
   * Share of the One Euro derivative used to extrapolate between detections (`predictControl`).
   * Below 1 because the filtered derivative outlives the movement: full gain overshoots a tilt that
   * has just stopped.
   */
  predictionGain: number
  /**
   * Furthest (ms) the prediction looks past the last detection: one interval at the nominal 20 Hz.
   * Fixed rather than following the live rate, so a detector stepped down under load holds its
   * last value instead of extrapolating further.
   */
  predictionMaxAheadMs: number
  /**
   * Arms-back boost (#93): how far behind its shoulder each wrist must be, in depth (landmark z,
   * away from the camera), as a multiple of shoulder width, for the sweep to start counting.
   */
  boostEnterDepthRatio: number
  /** Lower depth the sweep may sag to once boosting before it releases: hysteresis at the edge. */
  boostExitDepthRatio: number
  /** Continuous time the sweep must hold before `boost` turns on. */
  boostEngageMs: number
  /**
   * Highest the wrists may be above the shoulder line (pitch ratio) and still count as a sweep:
   * tucked wings sit at or below the shoulders, so arms thrown up and back in a climb never boost.
   */
  boostMaxPitchRatio: number
  /**
   * Mean arm visibility the sweep needs. Below the gate's `minVisibility`, since wrists behind the
   * body are partly hidden by it and MediaPipe reports them with less confidence.
   */
  boostMinVisibility: number
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
  predictionGain: 0.5,
  predictionMaxAheadMs: 50,
  boostEnterDepthRatio: 0.5,
  boostExitDepthRatio: 0.3,
  boostEngageMs: 300,
  boostMaxPitchRatio: 0.25,
  boostMinVisibility: 0.3,
  oneEuro: DEFAULT_ONE_EURO_PARAMS,
}

export interface GestureState {
  active: boolean
  /** Timestamp (ms) the raw gate condition most recently became continuously true, or null. */
  conditionSincePassedMs: number | null
  /** Timestamp (ms) the raw gate condition most recently became continuously false, or null. */
  conditionSinceFailedMs: number | null
  /** Arms-back boost is on (#93). Only ever true while `active`. */
  boost: boolean
  /** Timestamp (ms) the arms-back sweep most recently became continuously true, or null. */
  sweptSinceMs: number | null
  rollFilter: OneEuroState
  pitchFilter: OneEuroState
}

export const DEFAULT_GESTURE_STATE: GestureState = {
  active: false,
  conditionSincePassedMs: null,
  conditionSinceFailedMs: null,
  boost: false,
  sweptSinceMs: null,
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

export interface ControlAxes {
  roll: number
  pitch: number
}

const scratchAxes: ControlAxes = { roll: 0, pitch: 0 }

/**
 * Filtered wrist-line angle and arm height to control axes: subtract the calibrated neutral, apply
 * the deadzone and full scale, then the roll response curve. Shared by the interpreter and by
 * `predictControl`, so a predicted value is mapped exactly like a measured one. Writes into `out`.
 */
export function mapControl(
  rollDeg: number,
  pitchRatio: number,
  calibration: Calibration,
  params: GestureParams,
  out: ControlAxes,
): ControlAxes {
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
  out.roll = clampAxis(roll)
  out.pitch = clampAxis(pitch)
  return out
}

/**
 * Where the controls will be `aheadMs` after the last detection, extrapolated from the One Euro
 * filters' own value and derivative (#66). The look-ahead is capped at `predictionMaxAheadMs`, so
 * a stalled detector never runs away. Returns false (and leaves `out` alone) when there is
 * nothing to extrapolate: no filtered sample yet, or the gate is off.
 */
export function predictControl(
  state: GestureState,
  calibration: Calibration,
  aheadMs: number,
  params: GestureParams,
  out: ControlAxes,
): boolean {
  if (!state.active || !state.rollFilter.initialized || !state.pitchFilter.initialized) return false
  const ahead =
    (Math.min(Math.max(aheadMs, 0), params.predictionMaxAheadMs) / 1000) * params.predictionGain
  mapControl(
    state.rollFilter.xPrev + state.rollFilter.dxPrev * ahead,
    state.pitchFilter.xPrev + state.pitchFilter.dxPrev * ahead,
    calibration,
    params,
    out,
  )
  return true
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

/** Raw per-frame arm measurements, before filtering, calibration or gating. */
export interface ArmMeasurement {
  /** Whether the arms-outstretched gate condition holds on this frame (no timing applied). */
  outstretched: boolean
  /**
   * How far the shallower wrist is behind its shoulder in depth (z grows away from the camera),
   * over shoulder width. Taking the shallower wrist means both arms must sweep: one arm back reads
   * as the other arm's depth.
   */
  sweepDepthRatio: number
  /** Wrist-to-wrist line angle in degrees, positive when the player's right wrist is lower. */
  rollDeg: number
  /** Mean wrist height above the shoulders, divided by shoulder width. Positive = arms raised. */
  pitchRatio: number
  /** Live shoulder distance in normalized image units, or the fallback when it can't be measured. */
  shoulderWidth: number
  /** Mean visibility of both shoulders, elbows and wrists. */
  meanVisibility: number
}

/**
 * Measures the arms on a single frame. Null when an arm landmark is missing. Shared by the
 * gesture interpreter and the calibration flow (#17) so both agree on what "arms out" means.
 */
export function measureArms(
  landmarks: PoseLandmarks | null,
  fallbackShoulderWidth: number = DEFAULT_CALIBRATION.shoulderWidth,
  params: GestureParams = DEFAULT_GESTURE_PARAMS,
): ArmMeasurement | null {
  const arms = getArmLandmarks(landmarks)
  if (!arms) return null

  const { leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist } = arms

  const shoulderWidth = distance(leftShoulder, rightShoulder) || fallbackShoulderWidth
  const wristSpanRatio = distance(leftWrist, rightWrist) / shoulderWidth

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

  const outstretched =
    leftElbowAngle >= params.minElbowAngleDeg &&
    rightElbowAngle >= params.minElbowAngleDeg &&
    wristSpanRatio >= params.minWristSpanRatio &&
    meanVisibility >= params.minVisibility

  const rollDeg =
    (Math.atan2(rightWrist.y - leftWrist.y, rightWrist.x - leftWrist.x) * 180) / Math.PI
  const pitchRatio =
    ((leftShoulder.y + rightShoulder.y) / 2 - (leftWrist.y + rightWrist.y) / 2) / shoulderWidth
  const sweepDepthRatio =
    Math.min(leftWrist.z - leftShoulder.z, rightWrist.z - rightShoulder.z) / shoulderWidth

  return { outstretched, sweepDepthRatio, rollDeg, pitchRatio, shoulderWidth, meanVisibility }
}

/**
 * Whether this frame shows the arms-back sweep (#93): both wrists behind their shoulders, at or
 * below shoulder height, well enough tracked. `boosting` selects the lower exit depth, so a sweep
 * that sags a little mid-boost doesn't flicker off.
 */
function isSwept(arms: ArmMeasurement, boosting: boolean, params: GestureParams): boolean {
  const depth = boosting ? params.boostExitDepthRatio : params.boostEnterDepthRatio
  return (
    arms.sweepDepthRatio >= depth &&
    arms.pitchRatio <= params.boostMaxPitchRatio &&
    arms.meanVisibility >= params.boostMinVisibility
  )
}

export function interpretPose(
  landmarks: PoseLandmarks | null,
  calibration: Calibration = DEFAULT_CALIBRATION,
  state: GestureState = DEFAULT_GESTURE_STATE,
  tMs: number,
  params: GestureParams = DEFAULT_GESTURE_PARAMS,
): InterpretPoseResult {
  const arms = measureArms(landmarks, calibration.shoulderWidth, params)

  if (!arms) {
    const gate = updateGate(false, state, tMs, params)
    return {
      input: {
        roll: 0,
        pitch: 0,
        active: gate.active,
        boost: false,
        confidence: 0,
        source: 'pose',
      },
      state: { ...state, ...gate, boost: false, sweptSinceMs: null },
    }
  }

  // The sweep only counts once flying (the gate already on), and it keeps the gate on: arms swept
  // back fail the outstretched check (the span collapses), but the player hasn't left.
  const swept = state.active && isSwept(arms, state.boost, params)
  const gate = updateGate(arms.outstretched || swept, state, tMs, params)
  const sweptSinceMs = swept ? (state.sweptSinceMs ?? tMs) : null
  const boost =
    gate.active &&
    sweptSinceMs !== null &&
    (state.boost || tMs - sweptSinceMs >= params.boostEngageMs)
  const confidence = clamp(arms.meanVisibility, 0, 1)

  if (swept) {
    // Wrists behind and below the shoulders would read as a dive: tucked wings fly straight. The
    // filters restart when the arms come back out, so neither they nor the prediction carry the
    // pre-sweep attitude through the boost.
    return {
      input: { roll: 0, pitch: 0, active: gate.active, boost, confidence, source: 'pose' },
      state: {
        ...gate,
        boost,
        sweptSinceMs,
        rollFilter: DEFAULT_GESTURE_STATE.rollFilter,
        pitchFilter: DEFAULT_GESTURE_STATE.pitchFilter,
      },
    }
  }

  const { value: rollDeg, state: rollFilter } = oneEuroFilter(
    arms.rollDeg,
    tMs,
    state.rollFilter,
    params.oneEuro,
  )
  const { value: pitchRatio, state: pitchFilter } = oneEuroFilter(
    arms.pitchRatio,
    tMs,
    state.pitchFilter,
    params.oneEuro,
  )

  const { roll, pitch } = mapControl(rollDeg, pitchRatio, calibration, params, scratchAxes)

  return {
    input: { roll, pitch, active: gate.active, boost, confidence, source: 'pose' },
    state: { ...gate, boost, sweptSinceMs, rollFilter, pitchFilter },
  }
}
