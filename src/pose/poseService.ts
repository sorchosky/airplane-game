// Runs MediaPipe Pose Landmarker (lite) on the shared camera `<video>` element at a constant
// 20 Hz and publishes each result to `poseStore`. The model and WASM runtime are self-hosted
// under `public/mediapipe/` (see `scripts/copy-mediapipe-wasm.mjs`) and only downloaded once the
// player taps Start, via a dynamic import that also keeps MediaPipe's JS out of the main bundle.

import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { latencyProbe } from '../debug/latencyProbe'
import {
  detectionIntervalMs,
  INITIAL_DETECTION_RATE,
  stepDetectionRate,
  type DetectionRateState,
} from './detectionRate'
import {
  createDetectionStats,
  pace,
  recordDetection,
  toPoseFrame,
  type DetectionStats,
} from './poseFrame'
import { usePoseStore, type PoseDelegate } from './poseStore'

const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe/wasm`
const MODEL_PATH = `${import.meta.env.BASE_URL}mediapipe/pose_landmarker_lite.task`

/** `HTMLMediaElement.readyState` value once the current frame's pixels are available. */
const HAVE_CURRENT_DATA = 2

let loading: Promise<PoseLandmarker> | null = null
let landmarker: PoseLandmarker | null = null

let running = false
/** Bumped on every start/stop so a start that resolves after a stop (or restart) is dropped. */
let generation = 0
let video: HTMLVideoElement | null = null
let cancelScheduled: () => void = () => undefined
let busy = false
let dueMs = 0
/** Steps the detection rate down when inference is slow (#65). */
let rate: DetectionRateState = INITIAL_DETECTION_RATE
let lastTimestampMs = -1
let lastVideoTime = -1
let stats: DetectionStats = createDetectionStats()
let loggedDetectError = false

async function createLandmarker(): Promise<{ landmarker: PoseLandmarker; delegate: PoseDelegate }> {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
  const create = (delegate: PoseDelegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    })

  try {
    return { landmarker: await create('GPU'), delegate: 'GPU' }
  } catch (err) {
    console.warn('[poseService] GPU delegate unavailable, falling back to CPU', err)
    return { landmarker: await create('CPU'), delegate: 'CPU' }
  }
}

/**
 * Downloads and initializes the model once. Safe to call repeatedly; a failed load can be retried
 * by calling again.
 */
export function loadPoseModel(): Promise<PoseLandmarker> {
  if (!loading) {
    usePoseStore.setState({ modelStatus: 'loading' })
    loading = createLandmarker().then(
      (loaded) => {
        landmarker = loaded.landmarker
        usePoseStore.setState({ modelStatus: 'ready', delegate: loaded.delegate })
        return loaded.landmarker
      },
      (err: unknown) => {
        loading = null
        usePoseStore.setState({ modelStatus: 'error', delegate: null })
        throw err
      },
    )
  }
  return loading
}

function detect(): void {
  const el = video
  if (busy || !landmarker || !el) return
  if (el.readyState < HAVE_CURRENT_DATA || el.videoWidth === 0) return
  // The rAF fallback can fire more than once per camera frame; don't detect the same frame twice.
  if (el.currentTime === lastVideoTime) return

  const now = performance.now()
  const paced = pace(now, dueMs, detectionIntervalMs(rate))
  dueMs = paced.dueMs
  if (!paced.run) return

  busy = true
  try {
    // VIDEO mode rejects timestamps that don't strictly increase.
    const timestampMs = Math.max(now, lastTimestampMs + 1)
    lastTimestampMs = timestampMs
    lastVideoTime = el.currentTime

    const result = landmarker.detectForVideo(el, timestampMs)
    const endMs = performance.now()
    const inferenceMs = endMs - now
    stats = recordDetection(stats, now, inferenceMs)
    rate = stepDetectionRate(rate, stats.inferenceMs, endMs)
    latencyProbe.markDetect(now, endMs)

    usePoseStore.setState({
      frame: toPoseFrame(result, timestampMs),
      detectedAtMs: timestampMs,
      inferenceMs: stats.inferenceMs,
      hz: stats.hz,
    })
  } catch (err) {
    if (!loggedDetectError) {
      console.error('[poseService] detection failed', err)
      loggedDetectError = true
    }
  } finally {
    busy = false
  }
}

function scheduleNext(): void {
  const el = video
  if (!running || !el) return

  // Prefer one callback per decoded camera frame; fall back to rAF where unsupported. The
  // frame metadata carries the camera's own capture time where the browser reports it (Chrome
  // does for local streams); otherwise the latency probe stamps the callback time and says so.
  if (typeof el.requestVideoFrameCallback === 'function') {
    const id = el.requestVideoFrameCallback((_now, metadata) => {
      const captureMs = metadata.captureTime
      latencyProbe.markCameraFrame(
        captureMs ?? Number.NaN,
        performance.now(),
        captureMs !== undefined,
      )
      detect()
      scheduleNext()
    })
    cancelScheduled = () => el.cancelVideoFrameCallback(id)
  } else {
    const id = requestAnimationFrame(() => {
      latencyProbe.markCameraFrame(Number.NaN, performance.now(), false)
      detect()
      scheduleNext()
    })
    cancelScheduled = () => cancelAnimationFrame(id)
  }
}

/**
 * Loads the model (if needed) and starts detecting on `el`. Call once the camera is live. Resolves
 * once the loop is running; rejects if the model fails to load (`modelStatus` is then `error`).
 */
export async function startPoseService(el: HTMLVideoElement): Promise<void> {
  if (running) return
  running = true
  video = el
  const startedGeneration = ++generation

  try {
    await loadPoseModel()
  } catch (err) {
    if (startedGeneration === generation) {
      running = false
      video = null
    }
    throw err
  }
  // `stopPoseService` (and maybe another start) may have run while the model was downloading.
  if (startedGeneration !== generation) return

  dueMs = 0
  rate = INITIAL_DETECTION_RATE
  lastVideoTime = -1
  stats = createDetectionStats()
  scheduleNext()
}

/** Stops the detection loop and clears the published pose. The loaded model is kept for reuse. */
export function stopPoseService(): void {
  running = false
  generation += 1
  cancelScheduled()
  cancelScheduled = () => undefined
  video = null
  usePoseStore.setState({ frame: null, detectedAtMs: 0, inferenceMs: 0, hz: 0 })
}
