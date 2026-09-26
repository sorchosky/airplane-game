import type { ReplayFrame } from '../input/replayFixture'
import { usePoseStore, type PoseFrame } from '../pose/poseStore'

/**
 * Records live `poseStore` detections into the replay fixture shape (`tests/fixtures/replays/`),
 * so a real session can be played back with `?input=replay&replay=<name>`.
 */

export interface PoseRecording {
  /** `detectedAtMs` of the first detection; frame times are relative to it. */
  startMs: number | null
  lastDetectedAtMs: number
  frames: ReplayFrame[]
}

export function createPoseRecording(): PoseRecording {
  return { startMs: null, lastDetectedAtMs: -1, frames: [] }
}

/** Adds one detection. A repeat of the last `detectedAtMs` (no new detection) is ignored. */
export function appendDetection(
  recording: PoseRecording,
  frame: PoseFrame | null,
  detectedAtMs: number,
): void {
  if (detectedAtMs <= 0 || detectedAtMs === recording.lastDetectedAtMs) return
  recording.lastDetectedAtMs = detectedAtMs
  recording.startMs ??= detectedAtMs
  recording.frames.push({
    tMs: Math.round(detectedAtMs - recording.startMs),
    landmarks: frame?.landmarks ?? null,
    worldLandmarks: frame?.worldLandmarks ?? null,
  })
}

/** The fixture file: one frame per line, so recordings stay diffable. */
export function recordingToJson(recording: PoseRecording): string {
  const body = recording.frames.map((f) => JSON.stringify(f)).join(',\n')
  return `{"frames":[\n${body}\n]}\n`
}

/** Starts recording every new detection. Call the returned function to stop and get the result. */
export function startPoseRecorder(): () => PoseRecording {
  const recording = createPoseRecording()
  const { frame, detectedAtMs } = usePoseStore.getState()
  appendDetection(recording, frame, detectedAtMs)
  const unsubscribe = usePoseStore.subscribe((s) =>
    appendDetection(recording, s.frame, s.detectedAtMs),
  )
  return () => {
    unsubscribe()
    return recording
  }
}
