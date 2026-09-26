import { Vector3 } from 'three'
import {
  createInitialFlightState,
  DEFAULT_FLIGHT_PARAMS,
  step,
  type FlightParams,
} from '../flight/flightModel'
import type { ControlInput } from '../input/types'
import { DEFAULT_CALIBRATION } from '../pose/calibration'
import {
  DEFAULT_GESTURE_PARAMS,
  DEFAULT_GESTURE_STATE,
  interpretPose,
  predictControl,
  type ControlAxes,
  type GestureParams,
  type GestureState,
} from '../pose/gesture'
import { LANDMARK, type PoseLandmark, type PoseLandmarks } from '../pose/types'

/**
 * The whole gesture-to-bank chain as a deterministic simulation (#66): a player tilts, the camera
 * delivers frames, detection runs on its schedule, the gesture interpreter and filters run, the
 * input reaches the flight model and the bank moves. Pure: no DOM, React or timers, so the E4
 * before-and-after numbers are exact and repeatable, and a regression shows up as a failing test.
 * Hardware costs (camera pipeline, inference) are parameters, set to the estimates in docs/perf.md.
 */

export interface ChainParams {
  /** ms from the player moving to the frame reaching `requestVideoFrameCallback`. */
  cameraDelayMs: number
  cameraFps: number
  detectionHz: number
  /** ms one `detectForVideo` call takes. */
  inferMs: number
  renderHz: number
  /** Extrapolate the controls between detections (`predictControl`). */
  predict: boolean
  gesture: GestureParams
  flight: FlightParams
}

export const BASELINE_CHAIN: ChainParams = {
  cameraDelayMs: 30,
  cameraFps: 30,
  detectionHz: 20,
  inferMs: 25,
  renderHz: 60,
  predict: false,
  gesture: DEFAULT_GESTURE_PARAMS,
  flight: DEFAULT_FLIGHT_PARAMS,
}

/** The T-pose arms, rotated rigidly about the shoulder midpoint by `rollDeg` (positive = right down). */
export function tiltedPose(rollDeg: number, noise: () => number = () => 0): PoseLandmarks {
  const cx = 0.5
  const cy = 0.43
  const arms: [number, number, number][] = [
    [LANDMARK.LEFT_SHOULDER, 0.43, 0.43],
    [LANDMARK.RIGHT_SHOULDER, 0.57, 0.43],
    [LANDMARK.LEFT_ELBOW, 0.325, 0.43],
    [LANDMARK.RIGHT_ELBOW, 0.675, 0.43],
    [LANDMARK.LEFT_WRIST, 0.22, 0.43],
    [LANDMARK.RIGHT_WRIST, 0.78, 0.43],
  ]
  const a = (rollDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const points: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }))
  for (const [i, x, y] of arms) {
    const dx = x - cx
    const dy = y - cy
    points[i] = {
      x: cx + dx * cos - dy * sin + noise(),
      y: cy + dx * sin + dy * cos + noise(),
      z: 0,
      visibility: 0.95,
    }
  }
  return points
}

export interface TiltResponse {
  /** ms from the tilt to the first rendered frame with 0.5° of bank. */
  firstMotionMs: number
  /** ms to half of the bank the tilt finally commands. */
  halfBankMs: number
  /** Largest bank past the final value, as a fraction of it. 0 = no overshoot. */
  overshoot: number
  /** The same in degrees of bank; under 0.5° is below what reads on screen. */
  overshootDeg: number
  finalBankDeg: number
}

/**
 * The player holds a level T-pose, then snaps to `tiltDeg` at `phaseMs` into a detection
 * interval. Returns when the bank has settled (3 s). The gate is already engaged, as in flight.
 */
export function simulateTilt(params: ChainParams, tiltDeg: number, phaseMs: number): TiltResponse {
  const calibration = DEFAULT_CALIBRATION
  const frameMs = 1000 / params.renderHz
  const cameraMs = 1000 / params.cameraFps
  const detectMs = 1000 / params.detectionHz
  const tiltAtMs = 2000 + phaseMs
  const endMs = tiltAtMs + 3000

  let gesture: GestureState = DEFAULT_GESTURE_STATE
  let flight = createInitialFlightState(params.flight, new Vector3(0, 300, 0))
  const input: ControlInput = { roll: 0, pitch: 0, active: false, confidence: 1, source: 'pose' }
  const predicted: ControlAxes = { roll: 0, pitch: 0 }

  // Detections queued by completion time; the camera frame they read was captured earlier.
  const pending: { doneMs: number; landmarks: PoseLandmarks }[] = []
  let nextCameraMs = 0
  let dueMs = 0
  let lastDetectionMs = -Infinity

  let firstMotionMs = Infinity
  let halfBankMs = Infinity
  let peakBank = 0
  const bankTrace: number[] = []
  const timeTrace: number[] = []

  for (let frameAt = frameMs; frameAt <= endMs; frameAt += frameMs) {
    // Camera frames that arrived before this render frame, paced to the detection rate.
    while (nextCameraMs <= frameAt) {
      const deliveredMs = nextCameraMs + params.cameraDelayMs
      const capturedMs = nextCameraMs
      if (deliveredMs <= frameAt) {
        if (deliveredMs >= dueMs) {
          dueMs = Math.max(dueMs + detectMs, deliveredMs)
          const pose = tiltedPose(capturedMs >= tiltAtMs ? tiltDeg : 0)
          pending.push({ doneMs: deliveredMs + params.inferMs, landmarks: pose })
        }
        nextCameraMs += cameraMs
      } else {
        break
      }
    }

    // Detections finished by this frame are interpreted before the frame's sim step.
    while (pending.length > 0 && (pending[0]?.doneMs ?? Infinity) <= frameAt) {
      const detection = pending.shift()
      if (!detection) break
      const result = interpretPose(
        detection.landmarks,
        calibration,
        gesture,
        detection.doneMs,
        params.gesture,
      )
      gesture = result.state
      input.roll = result.input.roll
      input.pitch = result.input.pitch
      input.active = result.input.active
      lastDetectionMs = detection.doneMs
    }

    const control =
      params.predict &&
      predictControl(gesture, calibration, frameAt - lastDetectionMs, params.gesture, predicted)
        ? { ...input, roll: predicted.roll, pitch: predicted.pitch }
        : input

    flight = step(flight, control, frameMs / 1000, params.flight)
    const bankDeg = (flight.bank * 180) / Math.PI
    if (frameAt >= tiltAtMs) {
      bankTrace.push(bankDeg)
      timeTrace.push(frameAt - tiltAtMs)
      if (firstMotionMs === Infinity && Math.abs(bankDeg) >= 0.5) {
        firstMotionMs = frameAt - tiltAtMs
      }
      peakBank = Math.max(peakBank, bankDeg)
    }
  }

  const finalBankDeg = bankTrace.at(-1) ?? 0
  const half = finalBankDeg / 2
  const halfIndex = bankTrace.findIndex((b) => b >= half)
  if (halfIndex >= 0) halfBankMs = timeTrace[halfIndex] ?? Infinity
  return {
    firstMotionMs,
    halfBankMs,
    overshoot: finalBankDeg > 0 ? Math.max(0, peakBank / finalBankDeg - 1) : 0,
    overshootDeg: Math.max(0, peakBank - finalBankDeg),
    finalBankDeg,
  }
}

export interface TiltSummary {
  firstMotionMs: number
  halfBankMs: number
  /** Worst case over the phases, as a fraction and in degrees. */
  overshoot: number
  overshootDeg: number
}

/** Mean over `phases` tilt moments spread across one detection interval. */
export function summarizeTilt(params: ChainParams, tiltDeg: number, phases = 12): TiltSummary {
  const detectMs = 1000 / params.detectionHz
  let first = 0
  let half = 0
  let overshoot = 0
  let overshootDeg = 0
  for (let i = 0; i < phases; i++) {
    const r = simulateTilt(params, tiltDeg, (i / phases) * detectMs)
    first += r.firstMotionMs
    half += r.halfBankMs
    overshoot = Math.max(overshoot, r.overshoot)
    overshootDeg = Math.max(overshootDeg, r.overshootDeg)
  }
  return { firstMotionMs: first / phases, halfBankMs: half / phases, overshoot, overshootDeg }
}
