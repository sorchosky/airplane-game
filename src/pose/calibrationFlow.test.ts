import { describe, expect, it } from 'vitest'
import armsDown from '../../tests/fixtures/poses/arms-down.json'
import tiltLeft from '../../tests/fixtures/poses/tilt-left.json'
import tiltRight from '../../tests/fixtures/poses/tilt-right.json'
import tposeLevel from '../../tests/fixtures/poses/tpose-level.json'
import type { Calibration } from './calibration'
import {
  checkBody,
  DEFAULT_CALIBRATION_PARAMS,
  holdProgress,
  INITIAL_CALIBRATION_FLOW,
  mean,
  stdDev,
  stepCalibration,
  type CalibrationFlowState,
} from './calibrationFlow'
import { LANDMARK, type PoseLandmark, type PoseLandmarks } from './types'

const DETECT_MS = 50 // the pose service's 20 Hz

/** The #16 fixtures have no hips. Adds visible hips below the shoulders. */
function withHips(fixture: unknown, hipY = 0.75, visibility = 0.9): PoseLandmark[] {
  const landmarks = (fixture as PoseLandmarks).map((p) => ({ ...p }))
  landmarks[LANDMARK.LEFT_HIP] = { x: 0.43, y: hipY, z: 0, visibility }
  landmarks[LANDMARK.RIGHT_HIP] = { x: 0.57, y: hipY, z: 0, visibility }
  return landmarks
}

/** Scales a pose about the mid-shoulder point, like the player walking toward or away. */
function scaled(landmarks: PoseLandmarks, factor: number): PoseLandmark[] {
  return landmarks.map((p) =>
    p.visibility === 0 ? p : { ...p, x: 0.5 + (p.x - 0.5) * factor, y: 0.4 + (p.y - 0.4) * factor },
  )
}

const TPOSE = withHips(tposeLevel)

/** Feeds one pose (or a function of time) at the detection rate, from `fromMs` through `toMs`. */
function run(
  pose: PoseLandmarks | null | ((tMs: number) => PoseLandmarks | null),
  toMs: number,
  saved: Calibration | null = null,
  start: CalibrationFlowState = INITIAL_CALIBRATION_FLOW,
  fromMs = 0,
): CalibrationFlowState {
  let state = start
  for (let t = fromMs; t <= toMs; t += DETECT_MS) {
    state = stepCalibration(state, typeof pose === 'function' ? pose(t) : pose, t, saved)
  }
  return state
}

describe('mean and stdDev', () => {
  it('handles empty and single-value input', () => {
    expect(mean([])).toBe(0)
    expect(stdDev([])).toBe(0)
    expect(stdDev([3])).toBe(0)
  })

  it('computes population statistics', () => {
    expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5)
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })
})

describe('checkBody', () => {
  it('reports no person without landmarks or with hidden shoulders', () => {
    expect(checkBody(null)).toBe('noPerson')
    const hidden = TPOSE.map((p, i) =>
      i === LANDMARK.LEFT_SHOULDER ? { ...p, visibility: 0.1 } : p,
    )
    expect(checkBody(hidden)).toBe('noPerson')
  })

  it('reports too close when the hips are out of view', () => {
    expect(checkBody(tposeLevel as PoseLandmarks)).toBe('tooClose')
    expect(checkBody(withHips(tposeLevel, 1.1))).toBe('tooClose')
    expect(checkBody(withHips(tposeLevel, 0.75, 0.2))).toBe('tooClose')
  })

  it('checks shoulder width against the frame-width range', () => {
    expect(checkBody(TPOSE)).toBe('ok')
    const { minShoulderWidth, maxShoulderWidth } = DEFAULT_CALIBRATION_PARAMS
    const tposeShoulderWidth = 0.2
    expect(checkBody(scaled(TPOSE, (maxShoulderWidth * 1.1) / tposeShoulderWidth))).toBe('tooClose')
    expect(checkBody(scaled(TPOSE, (minShoulderWidth * 0.9) / tposeShoulderWidth))).toBe('tooFar')
    expect(checkBody(scaled(TPOSE, 0.6))).toBe('ok')
  })
})

describe('stepCalibration', () => {
  it('walks through the guidance phases as the player gets into position', () => {
    expect(run(null, 0).phase).toBe('noPerson')
    expect(run(tposeLevel as PoseLandmarks, 0).phase).toBe('tooClose')
    expect(run(withHips(armsDown), 0).phase).toBe('armsNotOut')
    expect(run(TPOSE, 0).phase).toBe('holding')
  })

  it('captures a calibration after a 2 s steady hold', () => {
    expect(run(TPOSE, 1950).phase).toBe('holding')

    const done = run(TPOSE, 2000)
    expect(done.phase).toBe('done')
    expect(done.reusedSaved).toBe(false)
    expect(done.result?.neutralRollDeg).toBeCloseTo(0, 6)
    expect(done.result?.neutralPitch).toBeCloseTo(0, 6)
    expect(done.result?.shoulderWidth).toBeCloseTo(0.2, 6)
  })

  it('averages a tilted neutral so a crooked phone or stance becomes level', () => {
    const done = run(withHips(tiltLeft), 2000)
    expect(done.phase).toBe('done')
    // Left wrist lower than right: negative roll, the same sign the gesture interpreter uses.
    expect(done.result?.neutralRollDeg).toBeLessThan(-15)
  })

  it('resets the hold when the player moves', () => {
    const tiltedFrom1000 = (t: number) => (t < 1000 ? TPOSE : withHips(tiltRight))
    const moved = run(tiltedFrom1000, 2000)
    expect(moved.phase).toBe('holding')
    expect(moved.holdStartMs).toBeGreaterThanOrEqual(1000)

    const settled = run(tiltedFrom1000, 3200)
    expect(settled.phase).toBe('done')
    expect(settled.result?.neutralRollDeg).toBeGreaterThan(15)
  })

  it('resets the hold when the arms drop', () => {
    const dropped = run((t) => (t === 1000 ? withHips(armsDown) : TPOSE), 2000)
    expect(dropped.phase).toBe('holding')
    expect(dropped.holdStartMs).toBe(1050)
  })

  it('reuses a matching saved calibration after a 1 s hold', () => {
    const saved: Calibration = { neutralRollDeg: 2, neutralPitch: 0.05, shoulderWidth: 0.21 }
    expect(run(TPOSE, 950, saved).phase).toBe('holding')

    const done = run(TPOSE, 1000, saved)
    expect(done.phase).toBe('done')
    expect(done.reusedSaved).toBe(true)
    expect(done.result).toBe(saved)
  })

  it('recalibrates when the pose no longer matches the saved one', () => {
    const saved: Calibration = { neutralRollDeg: 20, neutralPitch: 0, shoulderWidth: 0.2 }
    expect(run(TPOSE, 1500, saved).phase).toBe('holding')

    const done = run(TPOSE, 2000, saved)
    expect(done.phase).toBe('done')
    expect(done.reusedSaved).toBe(false)
    expect(done.result?.neutralRollDeg).toBeCloseTo(0, 6)
  })

  it('stays done once complete', () => {
    const done = run(TPOSE, 2000)
    expect(stepCalibration(done, null, 2050, null)).toBe(done)
  })
})

describe('holdProgress', () => {
  it('is 0 outside a hold and 1 once done', () => {
    expect(holdProgress(run(null, 0), 0, null)).toBe(0)
    expect(holdProgress(run(TPOSE, 2000), 2000, null)).toBe(1)
  })

  it('fills over the full hold, or the skip hold when matching a saved calibration', () => {
    expect(holdProgress(run(TPOSE, 1000), 1000, null)).toBeCloseTo(0.5, 6)

    const saved: Calibration = { neutralRollDeg: 0, neutralPitch: 0, shoulderWidth: 0.2 }
    expect(holdProgress(run(TPOSE, 500, saved), 500, saved)).toBeCloseTo(0.5, 6)
  })
})
