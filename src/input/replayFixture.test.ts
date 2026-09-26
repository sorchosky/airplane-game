import { describe, expect, it } from 'vitest'
import firstRun from '../../tests/fixtures/replays/first-run.json'
import tpose from '../../tests/fixtures/poses/tpose-level.json'
import { INITIAL_CALIBRATION_FLOW, stepCalibration } from '../pose/calibrationFlow'
import { DEFAULT_GESTURE_STATE, interpretPose } from '../pose/gesture'
import type { PoseLandmarks } from '../pose/types'
import {
  DEFAULT_REPLAY,
  frameIndexAt,
  getReplayNameFromUrl,
  hasReplayLoopFlag,
  parseReplayFixture,
  type ReplayFixture,
} from './replayFixture'

const pose = tpose as PoseLandmarks

function fixtureAt(...times: number[]): ReplayFixture {
  return parseReplayFixture({ frames: times.map((tMs) => ({ tMs, landmarks: pose })) })
}

describe('parseReplayFixture', () => {
  it('accepts frames with and without a person and derives the duration', () => {
    const fixture = parseReplayFixture({
      frames: [
        { tMs: 0, landmarks: null },
        { tMs: 50, landmarks: pose, worldLandmarks: [] },
        { tMs: 100, landmarks: pose, worldLandmarks: pose, label: 't-pose' },
      ],
    })
    expect(fixture.frames).toHaveLength(3)
    expect(fixture.durationMs).toBe(150)
  })

  it.each([
    ['no frames', {}],
    ['empty frames', { frames: [] }],
    ['a missing time', { frames: [{ landmarks: null }] }],
    [
      'time going backwards',
      {
        frames: [
          { tMs: 50, landmarks: null },
          { tMs: 0, landmarks: null },
        ],
      },
    ],
    ['a short landmark list', { frames: [{ tMs: 0, landmarks: pose.slice(0, 10) }] }],
    ['a malformed point', { frames: [{ tMs: 0, landmarks: [...pose.slice(1), { x: 1 }] }] }],
    ['a bad label', { frames: [{ tMs: 0, landmarks: null, label: 3 }] }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseReplayFixture(value)).toThrow(/replay fixture/)
  })
})

describe('frameIndexAt', () => {
  const fixture = fixtureAt(0, 50, 100, 150)

  it('is -1 before the first frame and picks the last frame whose time has come', () => {
    expect(frameIndexAt(fixtureAt(20, 70), 10, false)).toBe(-1)
    expect(frameIndexAt(fixture, 0, false)).toBe(0)
    expect(frameIndexAt(fixture, 49, false)).toBe(0)
    expect(frameIndexAt(fixture, 50, false)).toBe(1)
    expect(frameIndexAt(fixture, 149, false)).toBe(2)
  })

  it('holds the last frame after the end without loop, and wraps with it', () => {
    expect(frameIndexAt(fixture, 5000, false)).toBe(3)
    expect(fixture.durationMs).toBe(200)
    expect(frameIndexAt(fixture, 210, true)).toBe(0)
    expect(frameIndexAt(fixture, 360, true)).toBe(3)
  })
})

describe('URL flags', () => {
  it('reads the fixture name, falling back to the default for missing or unsafe names', () => {
    expect(getReplayNameFromUrl('?replay=tilt-demo')).toBe('tilt-demo')
    expect(getReplayNameFromUrl('')).toBe(DEFAULT_REPLAY)
    expect(getReplayNameFromUrl('?replay=../secrets')).toBe(DEFAULT_REPLAY)
  })

  it('reads the loop flag', () => {
    expect(hasReplayLoopFlag('?input=replay&loop')).toBe(true)
    expect(hasReplayLoopFlag('?input=replay')).toBe(false)
  })
})

// The generated first-run fixture, run through the real calibration and gesture code at its own
// timestamps: the same path the game takes, minus React and the render loop.
describe('first-run fixture', () => {
  const fixture = parseReplayFixture(firstRun)

  it('calibrates during the T-pose hold', () => {
    let flow = INITIAL_CALIBRATION_FLOW
    let doneLabel: string | undefined
    for (const frame of fixture.frames) {
      flow = stepCalibration(flow, frame.landmarks, frame.tMs, null)
      if (flow.phase === 'done') {
        doneLabel = frame.label
        break
      }
    }
    expect(flow.phase).toBe('done')
    expect(doneLabel).toBe('t-pose')
  })

  it('engages the gate, banks with the tilt and pitches with the arms', () => {
    let flow = INITIAL_CALIBRATION_FLOW
    let state = DEFAULT_GESTURE_STATE
    const bySegment = new Map<string, { roll: number; pitch: number; active: boolean }>()
    for (const frame of fixture.frames) {
      flow = stepCalibration(flow, frame.landmarks, frame.tMs, null)
      const calibration = flow.result ?? undefined
      const result = interpretPose(frame.landmarks, calibration, state, frame.tMs)
      state = result.state
      // The last frame of each segment, once the filters have settled on its pose.
      if (frame.label) bySegment.set(frame.label, result.input)
    }

    for (const label of ['t-pose', 'tilt-left', 'tilt-right', 'climb', 'dive']) {
      expect(bySegment.get(label)?.active, label).toBe(true)
    }
    expect(bySegment.get('tilt-left')?.roll).toBeLessThan(-0.2)
    expect(bySegment.get('tilt-right')?.roll).toBeGreaterThan(0.2)
    expect(bySegment.get('climb')?.pitch).toBeGreaterThan(0.3)
    expect(bySegment.get('dive')?.pitch).toBeLessThan(-0.3)
    expect(Math.abs(bySegment.get('level-out')?.roll ?? 1)).toBeLessThan(0.05)
    expect(bySegment.get('arms-at-sides')?.active).toBe(false)
  })
})
