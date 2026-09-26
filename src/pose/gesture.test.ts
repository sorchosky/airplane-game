import { describe, expect, it } from 'vitest'
import armsAtSides from '../../tests/fixtures/poses/arms-at-sides.json'
import armsDown from '../../tests/fixtures/poses/arms-down.json'
import armsUp from '../../tests/fixtures/poses/arms-up.json'
import noPerson from '../../tests/fixtures/poses/no-person.json'
import oneArmDown from '../../tests/fixtures/poses/one-arm-down.json'
import tiltLeft from '../../tests/fixtures/poses/tilt-left.json'
import tiltRight from '../../tests/fixtures/poses/tilt-right.json'
import tposeLevel from '../../tests/fixtures/poses/tpose-level.json'
import firstRun from '../../tests/fixtures/replays/first-run.json'
import { parseReplayFixture } from '../input/replayFixture'
import { DEFAULT_CALIBRATION, type Calibration } from './calibration'
import {
  DEFAULT_GESTURE_PARAMS,
  DEFAULT_GESTURE_STATE,
  interpretPose,
  predictControl,
  type GestureState,
} from './gesture'
import type { PoseLandmarks } from './types'

const FRAME_MS = 33 // ~30fps, comfortably finer than the 300/500ms hysteresis windows

/** Feeds the same landmarks in repeatedly from t=0 until just past the engage window. */
function runUntilSettled(
  landmarks: PoseLandmarks | null,
  calibration: Calibration = DEFAULT_CALIBRATION,
  untilMs = 400,
) {
  let state: GestureState = DEFAULT_GESTURE_STATE
  let result = interpretPose(landmarks, calibration, state, 0)
  state = result.state
  for (let t = FRAME_MS; t <= untilMs; t += FRAME_MS) {
    result = interpretPose(landmarks, calibration, state, t)
    state = result.state
  }
  return result
}

describe('interpretPose: arms-out gate', () => {
  it.each([
    ['T-pose level', tposeLevel],
    ['tilt right', tiltRight],
    ['tilt left', tiltLeft],
    ['arms up', armsUp],
  ])('engages for %s once outstretched long enough', (_name, fixture) => {
    const { input } = runUntilSettled(fixture as PoseLandmarks)
    expect(input.active).toBe(true)
  })

  it.each([
    ['arms down (bent elbows)', armsDown],
    ['one arm down (bent elbow)', oneArmDown],
    ['arms at sides (straight but narrow span)', armsAtSides],
    ['no person', noPerson],
  ])('never engages for %s', (_name, fixture) => {
    const { input } = runUntilSettled(fixture as PoseLandmarks | null)
    expect(input.active).toBe(false)
  })

  it('does not engage before 300ms of continuous outstretched arms', () => {
    let state: GestureState = DEFAULT_GESTURE_STATE
    let result = interpretPose(tposeLevel as PoseLandmarks, DEFAULT_CALIBRATION, state, 0)
    state = result.state
    result = interpretPose(tposeLevel as PoseLandmarks, DEFAULT_CALIBRATION, state, 250)
    expect(result.input.active).toBe(false)

    result = interpretPose(tposeLevel as PoseLandmarks, DEFAULT_CALIBRATION, state, 310)
    expect(result.input.active).toBe(true)
  })

  it('stays active through a brief drop that does not exceed the disengage grace', () => {
    let state: GestureState = DEFAULT_GESTURE_STATE
    let result = interpretPose(tposeLevel as PoseLandmarks, DEFAULT_CALIBRATION, state, 0)
    state = result.state
    result = interpretPose(tposeLevel as PoseLandmarks, DEFAULT_CALIBRATION, state, 350)
    state = result.state
    expect(result.input.active).toBe(true)

    // Arms drop for 200ms, well under the 500ms grace.
    result = interpretPose(armsDown as PoseLandmarks, DEFAULT_CALIBRATION, state, 550)
    state = result.state
    expect(result.input.active).toBe(true)

    // Arms come back out before the grace period elapses: still active, no re-engage delay needed.
    result = interpretPose(tposeLevel as PoseLandmarks, DEFAULT_CALIBRATION, state, 560)
    expect(result.input.active).toBe(true)
  })

  it('disengages once the drop exceeds the 500ms grace period', () => {
    let state: GestureState = DEFAULT_GESTURE_STATE
    let result = interpretPose(tposeLevel as PoseLandmarks, DEFAULT_CALIBRATION, state, 0)
    state = result.state
    result = interpretPose(tposeLevel as PoseLandmarks, DEFAULT_CALIBRATION, state, 350)
    state = result.state
    expect(result.input.active).toBe(true)

    result = interpretPose(armsDown as PoseLandmarks, DEFAULT_CALIBRATION, state, 400)
    state = result.state
    expect(result.input.active).toBe(true) // still within grace

    result = interpretPose(armsDown as PoseLandmarks, DEFAULT_CALIBRATION, state, 901)
    expect(result.input.active).toBe(false) // grace (500ms after 400) has elapsed
  })
})

describe('interpretPose: roll (mirrored space)', () => {
  it('is ~0 for a level T-pose', () => {
    const { input } = runUntilSettled(tposeLevel as PoseLandmarks)
    expect(input.roll).toBeCloseTo(0, 5)
  })

  it('is positive (bank right) when the right wrist sinks below the left', () => {
    const { input } = runUntilSettled(tiltRight as PoseLandmarks)
    expect(input.roll).toBeGreaterThan(0)
  })

  it('is negative (bank left) when the left wrist sinks below the right', () => {
    const { input } = runUntilSettled(tiltLeft as PoseLandmarks)
    expect(input.roll).toBeLessThan(0)
  })

  it('is symmetric between mirrored left and right tilts', () => {
    const right = runUntilSettled(tiltRight as PoseLandmarks).input.roll
    const left = runUntilSettled(tiltLeft as PoseLandmarks).input.roll
    expect(left).toBeCloseTo(-right, 5)
  })

  it('applies the calibrated neutral offset', () => {
    const calibration: Calibration = { ...DEFAULT_CALIBRATION, neutralRollDeg: 10 }
    const { input } = runUntilSettled(tposeLevel as PoseLandmarks, calibration)
    // Raw angle is 0; with a +10deg neutral, that reads as a left tilt relative to neutral.
    expect(input.roll).toBeLessThan(0)
  })

  it('stays within -1..1', () => {
    const { input } = runUntilSettled(tiltRight as PoseLandmarks)
    expect(input.roll).toBeLessThanOrEqual(1)
    expect(input.roll).toBeGreaterThanOrEqual(-1)
  })
})

describe('interpretPose: pitch', () => {
  it('is ~0 for a level T-pose', () => {
    const { input } = runUntilSettled(tposeLevel as PoseLandmarks)
    expect(input.pitch).toBeCloseTo(0, 5)
  })

  it('is positive (climb) when both wrists raise above the shoulder line', () => {
    const { input } = runUntilSettled(armsUp as PoseLandmarks)
    expect(input.pitch).toBeGreaterThan(0)
  })

  it('clamps to 1 well past full scale', () => {
    const { input } = runUntilSettled(armsUp as PoseLandmarks)
    expect(input.pitch).toBe(1)
  })
})

describe('interpretPose: confidence', () => {
  it('reflects landmark visibility when a person is tracked', () => {
    const { input } = runUntilSettled(tposeLevel as PoseLandmarks)
    expect(input.confidence).toBeCloseTo(0.95, 5)
  })

  it('is 0 with no person in frame', () => {
    const { input } = runUntilSettled(noPerson as PoseLandmarks | null)
    expect(input.confidence).toBe(0)
  })
})

describe('interpretPose: output shape', () => {
  it('always reports source "pose"', () => {
    const { input } = runUntilSettled(tposeLevel as PoseLandmarks)
    expect(input.source).toBe('pose')
  })

  it('handles a null landmark array without throwing', () => {
    expect(() => interpretPose(null, DEFAULT_CALIBRATION, DEFAULT_GESTURE_STATE, 0)).not.toThrow()
  })
})

describe('predictControl (#66)', () => {
  const calibration = DEFAULT_CALIBRATION
  const params = DEFAULT_GESTURE_PARAMS

  /** Interprets `poses` at `hz`, returning the state after the last one. */
  function run(poses: PoseLandmarks[], hz: number): { state: GestureState; tMs: number } {
    let state = DEFAULT_GESTURE_STATE
    let tMs = 0
    for (const pose of poses) {
      state = interpretPose(pose, calibration, state, tMs).state
      tMs += 1000 / hz
    }
    return { state, tMs: tMs - 1000 / hz }
  }

  it('has nothing to extrapolate before the gate engages', () => {
    const out = { roll: 0, pitch: 0 }
    const { state } = run([tposeLevel as PoseLandmarks], 20)
    expect(predictControl(state, calibration, 25, params, out)).toBe(false)
  })

  it('leans ahead in the direction the arms are moving, capped at one interval', () => {
    const level = Array.from({ length: 20 }, () => tposeLevel as PoseLandmarks)
    const tilting = [...level, tiltRight as PoseLandmarks]
    const { state } = run(tilting, 20)
    const measured = { roll: 0, pitch: 0 }
    const ahead = { roll: 0, pitch: 0 }
    const capped = { roll: 0, pitch: 0 }
    predictControl(state, calibration, 0, params, measured)
    predictControl(state, calibration, 50, params, ahead)
    predictControl(state, calibration, 500, params, capped)
    expect(ahead.roll).toBeGreaterThan(measured.roll)
    expect(capped.roll).toBeCloseTo(ahead.roll, 10)
  })

  // The recorded first-run fixture played at 60 Hz render frames: between two detections the
  // prediction may run ahead of the last measurement, but never far past both neighbours.
  it('never overshoots the recorded fixture by more than 0.05 of full roll', () => {
    const fixture = parseReplayFixture(firstRun)
    let state = DEFAULT_GESTURE_STATE
    let prevRoll = 0
    let worst = 0
    const predicted = { roll: 0, pitch: 0 }
    const frames = fixture.frames
    for (let i = 0; i < frames.length - 1; i++) {
      const frame = frames[i]
      const next = frames[i + 1]
      if (!frame || !next) break
      const result = interpretPose(frame.landmarks, calibration, state, frame.tMs)
      state = result.state
      const nextRoll = interpretPose(next.landmarks, calibration, state, next.tMs).input.roll
      for (let t = frame.tMs; t < next.tMs; t += 1000 / 60) {
        if (!predictControl(state, calibration, t - frame.tMs, params, predicted)) continue
        const hi = Math.max(prevRoll, result.input.roll, nextRoll)
        const lo = Math.min(prevRoll, result.input.roll, nextRoll)
        worst = Math.max(worst, predicted.roll - hi, lo - predicted.roll)
      }
      prevRoll = result.input.roll
    }
    expect(worst).toBeLessThan(0.05)
  })
})
