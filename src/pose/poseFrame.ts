import type { PoseFrame } from './poseStore'
import type { PoseLandmark, PoseLandmarks } from './types'

// Pure helpers for the pose service: result conversion, detection pacing and stats. No DOM or
// MediaPipe runtime imports, so they unit test without a camera or WASM.

/**
 * Top detection rate. Leaves headroom for rendering and screen mirroring on a phone;
 * `detectionRate.ts` steps it down when inference is slow.
 */
export const DETECTION_HZ = 20
export const DETECTION_INTERVAL_MS = 1000 / DETECTION_HZ

/** Structural subset of MediaPipe's `NormalizedLandmark` / `Landmark` that we read. */
interface RawLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

/** Structural subset of MediaPipe's `PoseLandmarkerResult`. */
export interface RawPoseResult {
  landmarks: readonly (readonly RawLandmark[])[]
  worldLandmarks: readonly (readonly RawLandmark[])[]
}

function toLandmark(raw: RawLandmark, x: number): PoseLandmark {
  return { x, y: raw.y, z: raw.z, visibility: raw.visibility ?? 0 }
}

/**
 * Flips normalized landmarks into mirrored (selfie) space, matching the mirrored preview, so a
 * tilt to the player's right reads as a tilt to the right on screen (see CLAUDE.md).
 */
export function mirrorLandmarks(raw: readonly RawLandmark[]): PoseLandmarks {
  return raw.map((l) => toLandmark(l, 1 - l.x))
}

/** World landmarks are centered on the hips, so mirroring is a sign flip on x. */
export function mirrorWorldLandmarks(raw: readonly RawLandmark[]): PoseLandmarks {
  return raw.map((l) => toLandmark(l, -l.x))
}

/** Converts the first detected pose to a mirrored `PoseFrame`, or null if nobody was found. */
export function toPoseFrame(result: RawPoseResult, timestampMs: number): PoseFrame | null {
  const landmarks = result.landmarks[0]
  if (!landmarks || landmarks.length === 0) return null
  return {
    landmarks: mirrorLandmarks(landmarks),
    worldLandmarks: mirrorWorldLandmarks(result.worldLandmarks[0] ?? []),
    timestampMs,
  }
}

/**
 * Paces detection to `intervalMs` on average even though camera frames arrive on their own
 * clock. `dueMs` advances by whole intervals rather than restarting from `nowMs`, so a 30 fps
 * camera still yields 20 Hz (alternating 1- and 2-frame gaps) instead of rounding down to 15 Hz.
 * If we fall more than an interval behind (tab hidden, slow frame), the schedule resets rather
 * than bursting to catch up.
 */
export function pace(
  nowMs: number,
  dueMs: number,
  intervalMs: number = DETECTION_INTERVAL_MS,
): { run: boolean; dueMs: number } {
  if (nowMs < dueMs) return { run: false, dueMs }
  const next = dueMs + intervalMs
  return { run: true, dueMs: nowMs >= next ? nowMs + intervalMs : next }
}

export interface DetectionStats {
  /** Start time of the detection that opened the current window, or -1 before the first. */
  windowStartMs: number
  /** Detections started since `windowStartMs`, not counting the one that opened it. */
  windowCount: number
  hz: number
  inferenceMs: number
}

/** Window the Hz readout is averaged over, so it's steady enough to read. */
const STATS_WINDOW_MS = 1000
/** Weight of each new sample in the inference-time moving average. */
const INFERENCE_SMOOTHING = 0.2

export function createDetectionStats(): DetectionStats {
  return { windowStartMs: -1, windowCount: 0, hz: 0, inferenceMs: 0 }
}

/** Folds one finished detection (started at `startMs`, took `inferenceMs`) into the stats. */
export function recordDetection(
  stats: DetectionStats,
  startMs: number,
  inferenceMs: number,
): DetectionStats {
  const smoothed =
    stats.windowStartMs < 0
      ? inferenceMs
      : stats.inferenceMs + (inferenceMs - stats.inferenceMs) * INFERENCE_SMOOTHING

  if (stats.windowStartMs < 0) {
    return { windowStartMs: startMs, windowCount: 0, hz: stats.hz, inferenceMs: smoothed }
  }

  const elapsed = startMs - stats.windowStartMs
  const count = stats.windowCount + 1
  if (elapsed < STATS_WINDOW_MS) {
    return { ...stats, windowCount: count, inferenceMs: smoothed }
  }
  return {
    windowStartMs: startMs,
    windowCount: 0,
    hz: (count * 1000) / elapsed,
    inferenceMs: smoothed,
  }
}
