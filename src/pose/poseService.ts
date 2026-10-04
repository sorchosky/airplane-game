// Runs MediaPipe Pose Landmarker (lite) on the shared camera `<video>` element, paced by
// `detectionRate.ts`, and publishes each result to `poseStore`. The model and WASM runtime are
// self-hosted under `public/mediapipe/` (see `scripts/copy-mediapipe-wasm.mjs`) and only
// downloaded once the player taps Start, via a dynamic import that also keeps MediaPipe's JS out
// of the main bundle.
//
// Inference runs in a worker (`pose.worker.ts`) where the browser supports it, and on the main
// thread otherwise; `?pose=worker|main` forces one (#67). Pacing, stats, mirroring and publishing
// are shared, so both paths feed `poseStore` and the latency probe the same way.

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
  type RawPoseResult,
} from './poseFrame'
import {
  getPoseRunnerOverride,
  selectPoseRunner,
  type PoseRunnerKind,
  type PoseWorkerRequest,
  type PoseWorkerResponse,
  type WorkerSupport,
} from './poseRunner'
import { usePoseStore, type PoseDelegate } from './poseStore'

const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe/wasm`
const MODEL_PATH = `${import.meta.env.BASE_URL}mediapipe/pose_landmarker_lite.task`

/** `HTMLMediaElement.readyState` value once the current frame's pixels are available. */
const HAVE_CURRENT_DATA = 2

type Runner = { kind: 'main'; landmarker: PoseLandmarker } | { kind: 'worker'; worker: Worker }

interface Loaded {
  runner: Runner
  delegate: PoseDelegate
}

let loading: Promise<void> | null = null
let runner: Runner | null = null

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

/** The one detection in flight on the worker. Results for anything else are dropped. */
interface Pending {
  id: number
  generation: number
  startMs: number
  timestampMs: number
  cameraMs: number
}
let pending: Pending | null = null
let nextRequestId = 0

/** Feature checks behind `selectPoseRunner`. Touches the DOM, so it isn't in `poseRunner.ts`. */
function probeWorkerSupport(): WorkerSupport {
  let offscreenWebgl2 = false
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const gl = new OffscreenCanvas(1, 1).getContext('webgl2')
      offscreenWebgl2 = gl !== null
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      offscreenWebgl2 = false
    }
  }
  return {
    moduleWorker: typeof Worker !== 'undefined',
    imageBitmap: typeof createImageBitmap === 'function',
    offscreenWebgl2,
  }
}

async function createMainRunner(): Promise<Loaded> {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
  const create = (delegate: PoseDelegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    })

  try {
    return { runner: { kind: 'main', landmarker: await create('GPU') }, delegate: 'GPU' }
  } catch (err) {
    console.warn('[poseService] GPU delegate unavailable, falling back to CPU', err)
    return { runner: { kind: 'main', landmarker: await create('CPU') }, delegate: 'CPU' }
  }
}

function postToWorker(worker: Worker, request: PoseWorkerRequest, transfer: Transferable[] = []) {
  worker.postMessage(request, transfer)
}

function createWorkerRunner(): Promise<Loaded> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
    const fail = (reason: string) => {
      worker.terminate()
      reject(new Error(reason))
    }
    worker.onerror = (event) => fail(event.message || 'pose worker failed to start')
    worker.onmessage = ({ data }: MessageEvent<PoseWorkerResponse>) => {
      if (data.type === 'init-error') {
        fail(data.message)
      } else if (data.type === 'ready') {
        worker.onmessage = onWorkerMessage
        worker.onerror = onWorkerError
        resolve({ runner: { kind: 'worker', worker }, delegate: data.delegate })
      }
    }
    // Absolute URLs: the worker resolves relative ones against its own script URL.
    postToWorker(worker, {
      type: 'init',
      wasmPath: new URL(WASM_PATH, location.href).href,
      modelPath: new URL(MODEL_PATH, location.href).href,
    })
  })
}

async function createRunner(kind: PoseRunnerKind, forced: boolean): Promise<Loaded> {
  if (kind === 'main') return createMainRunner()
  try {
    return await createWorkerRunner()
  } catch (err) {
    // A forced worker is for tracing it, so don't quietly measure the main thread instead.
    if (forced) throw err
    console.warn('[poseService] pose worker unavailable, running on the main thread', err)
    return createMainRunner()
  }
}

/**
 * Downloads and initializes the model once. Safe to call repeatedly; a failed load can be retried
 * by calling again.
 */
export function loadPoseModel(): Promise<void> {
  if (!loading) {
    usePoseStore.setState({ modelStatus: 'loading' })
    const override = getPoseRunnerOverride(window.location.search)
    const kind = selectPoseRunner(override, probeWorkerSupport())
    loading = createRunner(kind, override !== null).then(
      (loaded) => {
        runner = loaded.runner
        usePoseStore.setState({
          modelStatus: 'ready',
          delegate: loaded.delegate,
          runner: loaded.runner.kind,
        })
      },
      (err: unknown) => {
        loading = null
        usePoseStore.setState({ modelStatus: 'error', delegate: null, runner: null })
        throw err
      },
    )
  }
  return loading
}

function logDetectError(err: unknown): void {
  if (!loggedDetectError) {
    console.error('[poseService] detection failed', err)
    loggedDetectError = true
  }
}

/** Folds a finished detection into the stats, the rate governor, the probe and the store. */
function publish(
  result: RawPoseResult,
  timestampMs: number,
  startMs: number,
  inferenceMs: number,
  cameraMs: number,
): void {
  const endMs = performance.now()
  stats = recordDetection(stats, startMs, inferenceMs)
  rate = stepDetectionRate(rate, stats.inferenceMs, endMs)
  latencyProbe.markDetect(startMs, endMs, cameraMs)

  usePoseStore.setState({
    frame: toPoseFrame(result, timestampMs),
    detectedAtMs: timestampMs,
    inferenceMs: stats.inferenceMs,
    hz: stats.hz,
  })
}

function onWorkerMessage({ data }: MessageEvent<PoseWorkerResponse>): void {
  if (data.type !== 'result' && data.type !== 'detect-error') return
  const request = pending
  if (!request || request.id !== data.id) return
  pending = null
  busy = false
  // Stopped (or restarted) while this frame was in the worker.
  if (!running || request.generation !== generation) return

  if (data.type === 'detect-error') {
    logDetectError(new Error(data.message))
    return
  }
  publish(data.result, request.timestampMs, request.startMs, data.inferenceMs, request.cameraMs)
}

/** An uncaught worker error loses the frame in flight; free the slot so detection carries on. */
function onWorkerError(event: ErrorEvent): void {
  pending = null
  busy = false
  logDetectError(new Error(event.message))
}

function detectInWorker(
  worker: Worker,
  el: HTMLVideoElement,
  startMs: number,
  timestampMs: number,
): void {
  const request: Pending = {
    id: nextRequestId++,
    generation,
    startMs,
    timestampMs,
    cameraMs: latencyProbe.cameraFrameMs,
  }
  pending = request
  createImageBitmap(el).then(
    (frame) => {
      if (pending !== request) {
        frame.close()
        return
      }
      postToWorker(worker, { type: 'detect', id: request.id, frame, timestampMs }, [frame])
    },
    (err: unknown) => {
      if (pending === request) {
        pending = null
        busy = false
      }
      logDetectError(err)
    },
  )
}

function detect(): void {
  const el = video
  const current = runner
  if (busy || !current || !el) return
  if (el.readyState < HAVE_CURRENT_DATA || el.videoWidth === 0) return
  // The rAF fallback can fire more than once per camera frame; don't detect the same frame twice.
  if (el.currentTime === lastVideoTime) return

  const now = performance.now()
  const paced = pace(now, dueMs, detectionIntervalMs(rate))
  dueMs = paced.dueMs
  if (!paced.run) return

  // VIDEO mode rejects timestamps that don't strictly increase.
  const timestampMs = Math.max(now, lastTimestampMs + 1)
  lastTimestampMs = timestampMs
  lastVideoTime = el.currentTime
  busy = true

  // The worker path stays busy until its result comes back, so one frame is in flight at most.
  if (current.kind === 'worker') {
    detectInWorker(current.worker, el, now, timestampMs)
    return
  }

  try {
    const result = current.landmarker.detectForVideo(el, timestampMs)
    publish(result, timestampMs, now, performance.now() - now, latencyProbe.cameraFrameMs)
  } catch (err) {
    logDetectError(err)
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

/**
 * Stops the detection loop and clears the published pose. The loaded model (and worker) is kept
 * for reuse; a result still in the worker is dropped when it lands.
 */
export function stopPoseService(): void {
  running = false
  generation += 1
  cancelScheduled()
  cancelScheduled = () => undefined
  video = null
  pending = null
  busy = false
  usePoseStore.setState({ frame: null, detectedAtMs: 0, inferenceMs: 0, hz: 0 })
}
