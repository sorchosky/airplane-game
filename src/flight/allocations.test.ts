import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { computeAudioParams, type EngineWindParams } from '../audio/audioParams'
import type { ControlInput } from '../input/types'
import { armLine, createArmLinePoints } from '../ui/poseOverlayMath'
import type { PoseLandmarks } from '../pose/types'
import {
  CHASE_CAMERA_PARAMS,
  chaseCameraFov,
  chaseCameraOrientation,
  dampVector3,
  desiredCameraPosition,
  framedLookAt,
} from './cameraMath'
import { DEFAULT_FLIGHT_PARAMS, createInitialFlightState, step } from './flightModel'
import { NEUTRAL_DEFLECTIONS, dampDeflections, targetDeflections } from './planeRig'

/**
 * The hot path must not allocate per frame (docs/perf.md). Each case runs a function the way
 * its per-frame caller does, with the caller's long-lived scratch objects, and asserts the heap
 * barely grew. Needs `gc()` exposed: `vite.config.ts` passes `--expose-gc` to the workers.
 *
 * Two things about the measurement:
 * - The code must be optimised first. In the interpreter every non-integer number is a heap
 *   object, so a short warm-up reads as hundreds of bytes per call of pure arithmetic. 60k calls
 *   gets every case through Maglev and TurboFan on Node 22.
 * - Even optimised code boxes some double stores into object fields (16 bytes each, and
 *   `Vector3.set` reads as one). That is V8, not us, and only typed arrays avoid it. The ceiling
 *   below allows a couple of those and still fails on any object, array or closure (32 bytes and
 *   up each). Measured after this change: step 32, camera 32, rig 16, audio 0, arm line 0 bytes
 *   per call; before it: 544, 440, 464, 106 and 528.
 * - V8 optimises on background threads, so on a slow or busy machine (a shared CI runner) a
 *   function can finish optimising partway through the measured loop, and the interpreted calls
 *   before that count as allocations: CI once read the camera case at 80 bytes that measures 16
 *   to 32 everywhere else. So each case is measured over several rounds and the smallest counts.
 *   A real per-call allocation shows in every round; a late optimisation only in one.
 */
declare const gc: (() => void) | undefined

const WARM_UP = 60_000
const ITERATIONS = 20_000
/** Measured rounds per case; the smallest growth counts (see above). */
const ROUNDS = 3
/**
 * Bytes per call each case may grow by: 1.5× what it measures on Node 22 (V8 double boxing, see
 * above) plus a little, so V8 drift passes and one extra object (32 bytes and up) fails.
 */
const CEILING_BYTES = {
  step: 56, // measured 32
  camera: 120, // measured 80 with the framing aim (#71); 48 before it
  rig: 32, // measured 16
  audio: 16, // measured 0
  armLine: 16, // measured 0
} as const

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

const input: ControlInput = {
  roll: 0.4,
  pitch: 0.2,
  active: true,
  confidence: 1,
  source: 'keyboard',
}

describe('hot path allocations', () => {
  const canMeasure = typeof gc === 'function'

  it.skipIf(!canMeasure)('flightModel.step in place allocates no objects', () => {
    const state = createInitialFlightState(DEFAULT_FLIGHT_PARAMS, new Vector3(0, 120, 0))
    const growth = heapGrowthPerCall(() => {
      step(state, input, 1 / 60, DEFAULT_FLIGHT_PARAMS, 0, state)
    })
    expect(growth).toBeLessThan(CEILING_BYTES.step)
  })

  it.skipIf(!canMeasure)('chase camera frame allocates no objects', () => {
    const plane = new Vector3(10, 120, -30)
    const desired = new Vector3()
    const position = new Vector3(0, 4, 12)
    const lookAt = new Vector3()
    const aim = new Vector3()
    const orientation = new Quaternion()
    const growth = heapGrowthPerCall(() => {
      desiredCameraPosition(plane, 0.3, CHASE_CAMERA_PARAMS, desired, 0.4)
      dampVector3(position, desired, 6, 1 / 60, position)
      dampVector3(lookAt, plane, 8, 1 / 60, lookAt)
      framedLookAt(position, lookAt, 60, CHASE_CAMERA_PARAMS.screenY, aim)
      chaseCameraOrientation(position, aim, 0.4, 0.25, orientation)
      chaseCameraFov(50, CHASE_CAMERA_PARAMS)
    })
    expect(growth).toBeLessThan(CEILING_BYTES.camera)
  })

  it.skipIf(!canMeasure)('plane rig frame allocates no objects', () => {
    const deflections = { ...NEUTRAL_DEFLECTIONS }
    const target = { ...NEUTRAL_DEFLECTIONS }
    const flight = { bank: 0.3, speed: 45 }
    const growth = heapGrowthPerCall(() => {
      targetDeflections(input, flight, 9.81, undefined, target)
      dampDeflections(deflections, target, 1 / 60)
    })
    expect(growth).toBeLessThan(CEILING_BYTES.rig)
  })

  it.skipIf(!canMeasure)('audio params frame allocates no objects', () => {
    const out: EngineWindParams = { engineFreq: 0, engineGain: 0, windCutoff: 0, windGain: 0 }
    const flight = { speed: 50, pitchAngle: 0.1, bank: 0.3 }
    const growth = heapGrowthPerCall(() => {
      computeAudioParams(flight, DEFAULT_FLIGHT_PARAMS, undefined, out)
    })
    expect(growth).toBeLessThan(CEILING_BYTES.audio)
  })

  it.skipIf(!canMeasure)('pose overlay arm line allocates no objects', () => {
    const landmarks: PoseLandmarks = Array.from({ length: 33 }, (_, i) => ({
      x: 0.2 + i * 0.01,
      y: 0.4,
      z: 0,
      visibility: 0.9,
    }))
    const points = createArmLinePoints()
    const video = { width: 640, height: 480 }
    const canvas = { width: 400, height: 300 }
    const growth = heapGrowthPerCall(() => {
      armLine(landmarks, video, canvas, points)
    })
    expect(growth).toBeLessThan(CEILING_BYTES.armLine)
  })
})
