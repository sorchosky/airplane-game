import { afterEach, describe, expect, it } from 'vitest'
import tpose from '../../tests/fixtures/poses/tpose-level.json'
import { parseReplayFixture } from '../input/replayFixture'
import { INITIAL_POSE_STATE, usePoseStore } from '../pose/poseStore'
import type { PoseLandmarks } from '../pose/types'
import {
  appendDetection,
  createPoseRecording,
  recordingToJson,
  startPoseRecorder,
} from './poseRecorder'

const pose = tpose as PoseLandmarks
const frame = (t: number) => ({ landmarks: pose, worldLandmarks: pose, timestampMs: t })

afterEach(() => usePoseStore.setState(INITIAL_POSE_STATE))

describe('poseRecorder', () => {
  it('records each new detection once, relative to the first', () => {
    const recording = createPoseRecording()
    appendDetection(recording, frame(1000), 1000)
    appendDetection(recording, frame(1000), 1000)
    appendDetection(recording, null, 1050)
    appendDetection(recording, frame(1100), 1100.4)
    expect(recording.frames.map((f) => f.tMs)).toEqual([0, 50, 100])
    expect(recording.frames[1]?.landmarks).toBeNull()
  })

  it('ignores the store before its first detection', () => {
    const recording = createPoseRecording()
    appendDetection(recording, null, 0)
    expect(recording.frames).toHaveLength(0)
  })

  it('writes JSON that loads back as a replay fixture', () => {
    const recording = createPoseRecording()
    appendDetection(recording, frame(10), 10)
    appendDetection(recording, null, 60)
    const fixture = parseReplayFixture(JSON.parse(recordingToJson(recording)))
    expect(fixture.frames).toHaveLength(2)
    expect(fixture.durationMs).toBe(100)
  })

  it('follows poseStore until stopped', () => {
    const stop = startPoseRecorder()
    usePoseStore.setState({ frame: frame(500), detectedAtMs: 500 })
    usePoseStore.setState({ inferenceMs: 12 })
    usePoseStore.setState({ frame: null, detectedAtMs: 550 })
    const recording = stop()
    usePoseStore.setState({ frame: frame(600), detectedAtMs: 600 })
    expect(recording.frames.map((f) => f.tMs)).toEqual([0, 50])
  })
})
