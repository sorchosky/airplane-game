import { describe, expect, it } from 'vitest'
import firstRun from '../../tests/fixtures/replays/first-run.json'
import { SHOT_BOOKMARKS, shotFlightState } from '../debug/shots'
import { DEFAULT_FLIGHT_PARAMS, step, type FlightState } from '../flight/flightModel'
import { onWorldWrap, useFlightStore, wrapWorld } from '../flight/flightStore'
import { parseReplayFixture } from '../input/replayFixture'
import type { ControlInput } from '../input/types'
import { DEFAULT_CALIBRATION } from '../pose/calibration'
import {
  DEFAULT_GESTURE_PARAMS,
  DEFAULT_GESTURE_STATE,
  createArmMeasurement,
  createInterpretPoseResult,
  interpretPose,
  type GestureState,
} from '../pose/gesture'
import { surfaceHeightAt } from './heightfield'
import { TERRAIN_CONFIG } from './terrainConfig'

// #177: a replay fixture flown across the wrap seam. The first-run recording goes through the real
// gesture interpreter into the real flight store, starting 600 m short of the +x edge heading
// east, so the plane wraps mid-recording while it banks and climbs.
const P = TERRAIN_CONFIG.worldPeriod
const DT = 1 / 60
const START_X = P / 2 - 600
const START_Z = 300
const EAST = -Math.PI / 2

/** The fixture's control input at every 60 Hz step, as the replay source would feed the sim. */
function replayInputs(): ControlInput[] {
  const fixture = parseReplayFixture(firstRun)
  const out = createInterpretPoseResult()
  const measurement = createArmMeasurement()
  let gesture: GestureState = DEFAULT_GESTURE_STATE
  const inputs: ControlInput[] = []
  let frame = 0
  let current: ControlInput = { roll: 0, pitch: 0, active: false, confidence: 0, source: 'replay' }
  for (let t = 0; t < fixture.durationMs; t += DT * 1000) {
    while (frame < fixture.frames.length && (fixture.frames[frame]?.tMs ?? Infinity) <= t) {
      const f = fixture.frames[frame]
      if (f) {
        const result = interpretPose(
          f.landmarks,
          DEFAULT_CALIBRATION,
          gesture,
          f.tMs,
          DEFAULT_GESTURE_PARAMS,
          out,
          measurement,
        )
        gesture = { ...result.state }
        current = { ...result.input, source: 'replay' }
      }
      frame++
    }
    inputs.push(current)
  }
  return inputs
}

function startState(): FlightState {
  const y = surfaceHeightAt(START_X, START_Z, TERRAIN_CONFIG) + 200
  return shotFlightState(
    {
      name: 'seam',
      position: [START_X, y, START_Z],
      heading: EAST,
      bank: 0,
      pitchAngle: 0,
      purpose: 'test',
    },
    DEFAULT_FLIGHT_PARAMS.cruiseSpeed,
  )
}

interface Sample {
  x: number
  y: number
  z: number
  bank: number
  heading: number
}

/** Flies the inputs through the store, wrapping at the start of every frame as the game does. */
function flyStore(inputs: readonly ControlInput[]): {
  samples: Sample[]
  wraps: number
  frameStartXs: number[]
} {
  useFlightStore.setState({ state: startState(), levellingOff: false })
  let wraps = 0
  const unsubscribe = onWorldWrap(() => wraps++)
  const samples: Sample[] = []
  const frameStartXs: number[] = []
  for (const input of inputs) {
    wrapWorld()
    const { state } = useFlightStore.getState()
    frameStartXs.push(state.position.x)
    const ground = surfaceHeightAt(state.position.x, state.position.z, TERRAIN_CONFIG)
    useFlightStore.getState().tick(input, DT, ground)
    const { x, y, z } = state.position
    samples.push({ x, y, z, bank: state.bank, heading: state.heading })
  }
  unsubscribe()
  useFlightStore.getState().reset()
  return { samples, wraps, frameStartXs }
}

/** The same flight with no wrapping at all: the plane flies on past P/2. */
function flyUnwrapped(inputs: readonly ControlInput[]): Sample[] {
  const state = startState()
  const samples: Sample[] = []
  for (const input of inputs) {
    const ground = surfaceHeightAt(state.position.x, state.position.z, TERRAIN_CONFIG)
    step(state, input, DT, DEFAULT_FLIGHT_PARAMS, ground, state)
    const { x, y, z } = state.position
    samples.push({ x, y, z, bank: state.bank, heading: state.heading })
  }
  return samples
}

describe('a replay across the wrap seam', () => {
  const inputs = replayInputs()

  it('steers the plane: the recording banks it while it crosses', () => {
    expect(inputs.some((input) => input.active)).toBe(true)
  })

  it('wraps exactly once and is deterministic run to run', () => {
    const first = flyStore(inputs)
    const second = flyStore(inputs)
    expect(first.wraps).toBe(1)
    expect(second.samples).toEqual(first.samples)
    // Every frame starts inside the period; the step may carry it a frame's flight past the edge
    // until the next frame's wrap.
    for (const x of first.frameStartXs) {
      expect(x).toBeGreaterThanOrEqual(-P / 2)
      expect(x).toBeLessThan(P / 2)
    }
  })

  it('flies the same path as an unwrapped world, a whole period over', () => {
    const wrapped = flyStore(inputs).samples
    const unwrapped = flyUnwrapped(inputs)
    expect(unwrapped.at(-1)?.x ?? 0).toBeGreaterThan(P / 2)
    // The ground is the same either side of the seam (#176) up to float rounding in the noise.
    wrapped.forEach((sample, i) => {
      const reference = unwrapped[i]
      if (!reference) throw new Error('missing sample')
      const dx = sample.x - reference.x
      expect(Math.abs(dx - P * Math.round(dx / P))).toBeLessThan(1e-3)
      expect(sample.y).toBeCloseTo(reference.y, 3)
      expect(sample.z).toBeCloseTo(reference.z, 3)
      expect(sample.bank).toBeCloseTo(reference.bank, 6)
      expect(sample.heading).toBeCloseTo(reference.heading, 6)
    })
  })

  it('leaves every ?shot= bookmark where it is: they all sit inside the period', () => {
    for (const shot of SHOT_BOOKMARKS) {
      useFlightStore.setState({ state: shotFlightState(shot, DEFAULT_FLIGHT_PARAMS.cruiseSpeed) })
      expect(wrapWorld(), shot.name).toBe(false)
    }
    useFlightStore.getState().reset()
  })
})
