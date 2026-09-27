import { describe, expect, it } from 'vitest'
import armsAtSides from '../../tests/fixtures/poses/arms-at-sides.json'
import armsDown from '../../tests/fixtures/poses/arms-down.json'
import armsUp from '../../tests/fixtures/poses/arms-up.json'
import noPerson from '../../tests/fixtures/poses/no-person.json'
import oneArmDown from '../../tests/fixtures/poses/one-arm-down.json'
import tiltLeft from '../../tests/fixtures/poses/tilt-left.json'
import tiltRight from '../../tests/fixtures/poses/tilt-right.json'
import tposeLevel from '../../tests/fixtures/poses/tpose-level.json'
import boostFixture from '../../tests/fixtures/replays/boost.json'
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
import { LANDMARK, type PoseLandmark, type PoseLandmarks } from './types'

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

// Arms-back boost (#93). The hand-authored poses are flat (z = 0), so these build synthetic ones:
// the T-pose's shoulders (0.2 apart) with the arms moved and pushed back in depth.
describe('interpretPose: arms-back boost', () => {
  const T_POSE = tposeLevel as PoseLandmarks
  const SHOULDER_WIDTH = 0.2
  const ARM = [
    LANDMARK.LEFT_ELBOW,
    LANDMARK.RIGHT_ELBOW,
    LANDMARK.LEFT_WRIST,
    LANDMARK.RIGHT_WRIST,
  ] as const

  type Edit = Partial<Record<number, Partial<PoseLandmark>>>
  function pose(base: PoseLandmarks, edit: Edit): PoseLandmarks {
    return base.map((p, i) => ({ ...p, ...edit[i] }))
  }

  /** Arms at `angleDeg` around the shoulder midpoint (positive = right wrist sinks), elbows straight. */
  function tilted(angleDeg: number): PoseLandmarks {
    const a = (angleDeg * Math.PI) / 180
    const cx = 0.5
    const cy = 0.4
    const edit: Edit = {}
    for (const i of ARM) {
      const p = T_POSE[i] as PoseLandmark
      const dx = p.x - cx
      const dy = p.y - cy
      edit[i] = {
        x: cx + dx * Math.cos(a) - dy * Math.sin(a),
        y: cy + dx * Math.sin(a) + dy * Math.cos(a),
      }
    }
    return pose(T_POSE, edit)
  }

  /**
   * Tucked wings: wrists just inside and below the shoulders (too narrow to pass as arms out), `depth` shoulder widths behind them
   * (elbows halfway). `rightDepth` defaults to the same.
   */
  function swept(depth: number, rightDepth = depth): PoseLandmarks {
    const z = (d: number) => d * SHOULDER_WIDTH
    return pose(T_POSE, {
      [LANDMARK.LEFT_ELBOW]: { x: 0.385, y: 0.47, z: z(depth) / 2 },
      [LANDMARK.RIGHT_ELBOW]: { x: 0.615, y: 0.47, z: z(rightDepth) / 2 },
      [LANDMARK.LEFT_WRIST]: { x: 0.37, y: 0.54, z: z(depth) },
      [LANDMARK.RIGHT_WRIST]: { x: 0.63, y: 0.54, z: z(rightDepth) },
    })
  }

  /** Pushes both wrists `depth` shoulder widths back without moving them in the image. */
  function deepened(base: PoseLandmarks, depth: number): PoseLandmarks {
    const z = depth * SHOULDER_WIDTH
    return pose(base, {
      [LANDMARK.LEFT_WRIST]: { z },
      [LANDMARK.RIGHT_WRIST]: { z },
    })
  }

  const armsUpPose = armsUp as PoseLandmarks
  /** The raised pose mirrored through the shoulder line: a full dive. */
  const fullDive = pose(
    armsUpPose,
    Object.fromEntries(ARM.map((i) => [i, { y: 0.8 - (armsUpPose[i] as PoseLandmark).y }])),
  )

  /** Engages the gate with a T-pose, then feeds `frames` (pose per 33 ms), returning every result. */
  function fly(frames: PoseLandmarks[], state0: GestureState = DEFAULT_GESTURE_STATE) {
    let state = state0
    let t = 0
    for (; t <= 400; t += FRAME_MS)
      state = interpretPose(T_POSE, DEFAULT_CALIBRATION, state, t).state
    expect(state.active).toBe(true)
    return frames.map((landmarks) => {
      t += FRAME_MS
      const result = interpretPose(landmarks, DEFAULT_CALIBRATION, state, t)
      state = result.state
      return result
    })
  }
  const hold = (landmarks: PoseLandmarks, ms: number) =>
    Array.from({ length: Math.ceil(ms / FRAME_MS) }, () => landmarks)

  it('triggers after both wrists hold behind their shoulders for 300 ms', () => {
    const results = fly(hold(swept(0.8), 600))
    const firstBoost = results.findIndex((r) => r.input.boost)
    expect(firstBoost).toBeGreaterThan(0)
    // Frame 0 starts the clock, so the boost lands on the first frame at or past 300 ms.
    expect(firstBoost * FRAME_MS).toBeGreaterThanOrEqual(DEFAULT_GESTURE_PARAMS.boostEngageMs)
    expect((firstBoost - 1) * FRAME_MS).toBeLessThan(DEFAULT_GESTURE_PARAMS.boostEngageMs)
    expect(results.slice(firstBoost).every((r) => r.input.boost)).toBe(true)
  })

  it('keeps the gate engaged and flies level through a long sweep', () => {
    const results = fly(hold(swept(0.8), 2000))
    expect(results.every((r) => r.input.active)).toBe(true)
    expect(results.every((r) => r.input.roll === 0 && r.input.pitch === 0)).toBe(true)
  })

  it('has nothing to extrapolate while swept', () => {
    const results = fly(hold(swept(0.8), 400))
    const last = results.at(-1)
    expect(last).toBeDefined()
    const out = { roll: 0, pitch: 0 }
    expect(predictControl(last!.state, DEFAULT_CALIBRATION, 25, DEFAULT_GESTURE_PARAMS, out)).toBe(
      false,
    )
  })

  it('ends when the arms come back out, and steering resumes', () => {
    const results = fly([...hold(swept(0.8), 500), ...hold(tiltRight as PoseLandmarks, 500)])
    expect(results.some((r) => r.input.boost)).toBe(true)
    expect(results.at(-1)?.input.boost).toBe(false)
    expect(results.at(-1)?.input.active).toBe(true)
    expect(results.at(-1)?.input.roll).toBeGreaterThan(0.2)
  })

  it('has hysteresis: sagging to 0.4 widths holds the boost, 0.2 ends it, 0.4 cannot restart it', () => {
    const results = fly([
      ...hold(swept(0.8), 400),
      ...hold(swept(0.4), 400),
      ...hold(swept(0.2), 100),
      ...hold(swept(0.4), 600),
    ])
    const at = (ms: number) => results[Math.floor(ms / FRAME_MS)]?.input.boost
    expect(at(390)).toBe(true)
    expect(at(790)).toBe(true)
    expect(at(880)).toBe(false)
    expect(results.slice(Math.ceil(900 / FRAME_MS)).some((r) => r.input.boost)).toBe(false)
  })

  it('does not flicker with depth noise around the entry threshold once boosting', () => {
    const noisy = Array.from({ length: 60 }, (_, i) => swept(i % 2 ? 0.55 : 0.35))
    const results = fly([...hold(swept(0.8), 400), ...noisy])
    expect(results.slice(Math.ceil(400 / FRAME_MS)).every((r) => r.input.boost)).toBe(true)
  })

  it('never boosts before the gate is engaged', () => {
    const result = runUntilSettled(swept(0.8), DEFAULT_CALIBRATION, 1500)
    expect(result.input.active).toBe(false)
    expect(result.input.boost).toBe(false)
  })

  it.each([
    ['one arm swept (left)', swept(0.8, 0)],
    ['one arm swept (right)', swept(0, 0.8)],
    ['a full tilt left (-45°)', tilted(-45)],
    ['a full tilt right (+45°)', tilted(45)],
    ['a full climb', armsUpPose],
    ['a full dive', fullDive],
    ['arms at sides', armsAtSides as PoseLandmarks],
    // Depth noise a real detector adds to the ordinary controls: under the entry threshold.
    ['a full tilt left with wrists 0.4 widths back', deepened(tilted(-45), 0.4)],
    ['a full tilt right with wrists 0.4 widths back', deepened(tilted(45), 0.4)],
    ['a full dive with wrists 0.4 widths back', deepened(fullDive, 0.4)],
    // Arms thrown up and back: behind, but above the shoulders.
    ['a full climb with the arms thrown back', deepened(armsUpPose, 1)],
  ])('never boosts on %s', (_name, landmarks) => {
    const results = fly(hold(landmarks, 1500))
    expect(results.some((r) => r.input.boost)).toBe(false)
  })

  it('stays off with no person in frame', () => {
    const results = fly(hold(noPerson as unknown as PoseLandmarks, 600))
    expect(results.some((r) => r.input.boost)).toBe(false)
  })
})

// Every recorded fixture played through the interpreter: only frames labelled `boost...` (a
// deliberate sweep and its release) may boost (#93).
describe('interpretPose: no boost false triggers on the replay fixtures', () => {
  const fixtures = import.meta.glob<unknown>('../../tests/fixtures/replays/*.json', {
    eager: true,
    import: 'default',
  })

  it('finds the fixtures', () => {
    expect(Object.keys(fixtures).length).toBeGreaterThan(0)
  })

  it.each(Object.entries(fixtures))('%s', (_path, json) => {
    const { frames } = parseReplayFixture(json)
    let state = DEFAULT_GESTURE_STATE
    const falseTriggers: string[] = []
    for (const frame of frames) {
      const result = interpretPose(frame.landmarks, DEFAULT_CALIBRATION, state, frame.tMs)
      state = result.state
      const deliberate = frame.label?.startsWith('boost') ?? false
      if (result.input.boost && !deliberate) falseTriggers.push(`${frame.tMs}ms ${frame.label}`)
    }
    expect(falseTriggers).toEqual([])
  })
})

describe('interpretPose: the boost fixture', () => {
  it('boosts through the held sweep, with the gate on, and stops by the release', () => {
    const { frames } = parseReplayFixture(boostFixture)
    let state = DEFAULT_GESTURE_STATE
    const boostByLabel = new Map<string, boolean[]>()
    const activeInSweep: boolean[] = []
    for (const frame of frames) {
      const result = interpretPose(frame.landmarks, DEFAULT_CALIBRATION, state, frame.tMs)
      state = result.state
      const label = frame.label ?? ''
      boostByLabel.set(label, [...(boostByLabel.get(label) ?? []), result.input.boost === true])
      if (label === 'boost-sweep') activeInSweep.push(result.input.active)
    }
    const sweep = boostByLabel.get('boost-sweep') ?? []
    // Eased in over 0.6 s, then held: boosting well before the segment is half over, to its end.
    expect(sweep.findIndex(Boolean)).toBeGreaterThan(0)
    expect(sweep.findIndex(Boolean)).toBeLessThan(sweep.length / 2)
    expect(sweep.at(-1)).toBe(true)
    expect(activeInSweep.every(Boolean)).toBe(true)
    expect(boostByLabel.get('boost-release')?.at(-1)).toBe(false)
  })
})
