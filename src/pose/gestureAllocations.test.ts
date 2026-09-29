import { describe, expect, it } from 'vitest'
import firstRun from '../../tests/fixtures/replays/first-run.json'
import { parseReplayFixture } from '../input/replayFixture'
import { DEFAULT_CALIBRATION } from './calibration'
import {
  DEFAULT_GESTURE_STATE,
  createArmMeasurement,
  createInterpretPoseResult,
  interpretPose,
  type GestureState,
} from './gesture'

declare const gc: (() => void) | undefined

const WARM_UP = 60_000
const ITERATIONS = 20_000
const ROUNDS = 3
// Six numeric writes can be boxed by V8 at 16 bytes each. No JS objects are created by the path.
const ALLOCATION_CEILING_BYTES = 128

function heapGrowthPerCall(fn: () => void): number {
  if (typeof gc !== 'function') throw new Error('gc() is not exposed')
  for (let i = 0; i < WARM_UP; i++) fn()
  let smallest = Infinity
  for (let round = 0; round < ROUNDS; round++) {
    gc()
    const before = process.memoryUsage().heapUsed
    for (let i = 0; i < ITERATIONS; i++) fn()
    const after = process.memoryUsage().heapUsed
    smallest = Math.min(smallest, (after - before) / ITERATIONS)
  }
  return smallest
}

describe('gesture hot path', () => {
  it('keeps caller-owned output replay-equivalent to the allocating API', () => {
    const { frames } = parseReplayFixture(firstRun)
    let legacyState: GestureState = DEFAULT_GESTURE_STATE
    let reusedState: GestureState = DEFAULT_GESTURE_STATE
    const reused = createInterpretPoseResult()
    const measurement = createArmMeasurement()

    for (const frame of frames) {
      const legacy = interpretPose(frame.landmarks, DEFAULT_CALIBRATION, legacyState, frame.tMs)
      const inPlace = interpretPose(
        frame.landmarks,
        DEFAULT_CALIBRATION,
        reusedState,
        frame.tMs,
        undefined,
        reused,
        measurement,
      )
      expect(inPlace.input).toEqual(legacy.input)
      expect(inPlace.state).toEqual(legacy.state)
      legacyState = legacy.state
      reusedState = inPlace.state
    }
  })

  it.skipIf(typeof gc !== 'function')(
    'does not allocate with caller-owned output and state',
    () => {
      const { frames } = parseReplayFixture(firstRun)
      const frame = frames[Math.floor(frames.length / 2)]
      expect(frame).toBeDefined()
      if (!frame) return

      const result = createInterpretPoseResult()
      const measurement = createArmMeasurement()
      let state: GestureState = DEFAULT_GESTURE_STATE
      let tMs = frame.tMs
      const growth = heapGrowthPerCall(() => {
        tMs += 50
        state = interpretPose(
          frame.landmarks,
          DEFAULT_CALIBRATION,
          state,
          tMs,
          undefined,
          result,
          measurement,
        ).state
      })
      expect(growth).toBeLessThan(ALLOCATION_CEILING_BYTES)
    },
  )
})
