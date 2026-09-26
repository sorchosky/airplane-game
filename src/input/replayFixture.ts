import type { PoseLandmark, PoseLandmarks } from '../pose/types'

/**
 * Recorded pose fixtures for `?input=replay`. Pure: no DOM, React or store imports. A fixture is
 * the pose service's output over time, so replaying it runs calibration, the gesture interpreter,
 * the control machine and flight exactly as a live camera would.
 */

export interface ReplayFrame {
  /** Detection time, ms from the start of the recording. Ascending. */
  tMs: number
  /** Optional segment name (`tilt-left`, `climb`), for tests and the debug readout. */
  label?: string
  /** 33 mirrored landmarks, or null when no person was detected. */
  landmarks: PoseLandmarks | null
  /** World landmarks in meters. Empty or null when the fixture didn't record them. */
  worldLandmarks?: PoseLandmarks | null
}

export interface ReplayFixture {
  frames: readonly ReplayFrame[]
  /** Length of one pass: the last frame's time plus one frame interval. */
  durationMs: number
}

/** Fixture name used when `?input=replay` has no `?replay=`. */
export const DEFAULT_REPLAY = 'first-run'

const LANDMARK_COUNT = 33

function isLandmark(value: unknown): value is PoseLandmark {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    typeof p.z === 'number' &&
    typeof p.visibility === 'number'
  )
}

function isLandmarkList(value: unknown, allowEmpty: boolean): value is PoseLandmarks {
  if (!Array.isArray(value)) return false
  if (allowEmpty && value.length === 0) return true
  return value.length === LANDMARK_COUNT && value.every(isLandmark)
}

/**
 * Validates parsed JSON as a fixture. Throws with the first problem found, so a bad recording
 * fails loudly instead of flying the plane on garbage.
 */
export function parseReplayFixture(value: unknown): ReplayFixture {
  const frames = (value as { frames?: unknown } | null)?.frames
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('replay fixture: expected a non-empty "frames" array')
  }

  let previousT = -Infinity
  frames.forEach((frame: unknown, i) => {
    const f = frame as Record<string, unknown> | null
    if (!f || typeof f.tMs !== 'number' || !Number.isFinite(f.tMs)) {
      throw new Error(`replay fixture: frame ${i} has no numeric tMs`)
    }
    if (f.tMs < previousT) throw new Error(`replay fixture: frame ${i} goes back in time`)
    previousT = f.tMs
    if (f.landmarks !== null && !isLandmarkList(f.landmarks, false)) {
      throw new Error(`replay fixture: frame ${i} landmarks must be null or 33 points`)
    }
    if (
      f.worldLandmarks !== undefined &&
      f.worldLandmarks !== null &&
      !isLandmarkList(f.worldLandmarks, true)
    ) {
      throw new Error(`replay fixture: frame ${i} worldLandmarks must be empty or 33 points`)
    }
    if (f.label !== undefined && typeof f.label !== 'string') {
      throw new Error(`replay fixture: frame ${i} label must be a string`)
    }
  })

  const typed = frames as ReplayFrame[]
  return {
    frames: typed,
    durationMs: frameAt(typed, typed.length - 1).tMs + frameIntervalMs(typed),
  }
}

/** `frames[index]`, for indices the caller has already bounded. */
export function frameAt(frames: readonly ReplayFrame[], index: number): ReplayFrame {
  const frame = frames[index]
  if (!frame) throw new RangeError(`replay frame ${index} out of range (0..${frames.length - 1})`)
  return frame
}

/** Median gap between frames; 50 ms (the 20 Hz detection rate) for a single-frame fixture. */
export function frameIntervalMs(frames: readonly ReplayFrame[]): number {
  if (frames.length < 2) return 50
  const gaps: number[] = []
  for (let i = 1; i < frames.length; i++) {
    gaps.push(frameAt(frames, i).tMs - frameAt(frames, i - 1).tMs)
  }
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)] ?? 50
}

/**
 * Index of the frame showing at `elapsedMs` since playback started: the last frame whose time has
 * come. -1 before the first frame. Without `loop` the last frame holds once the fixture ends (a
 * player standing still, not one who left); with `loop` playback wraps every `durationMs`.
 */
export function frameIndexAt(fixture: ReplayFixture, elapsedMs: number, loop: boolean): number {
  const { frames, durationMs } = fixture
  const t = loop && durationMs > 0 ? elapsedMs % durationMs : elapsedMs
  if (t < frameAt(frames, 0).tMs) return -1
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frameAt(frames, mid).tMs <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** `?replay=<name>`, restricted to a safe file-name alphabet; the default fixture otherwise. */
export function getReplayNameFromUrl(search: string): string {
  const value = new URLSearchParams(search).get('replay')
  return value && /^[a-z0-9-]+$/i.test(value) ? value : DEFAULT_REPLAY
}

/** `&loop` replays the fixture forever instead of holding its last frame. */
export function hasReplayLoopFlag(search: string): boolean {
  return new URLSearchParams(search).has('loop')
}
