import type { RawPoseResult } from './poseFrame'
import type { PoseDelegate } from './poseStore'

// Where Pose Landmarker inference runs (#67): on the main thread from the camera frame callback,
// or in a worker fed one `ImageBitmap` per detection. Pure selection logic plus the message
// protocol shared by `poseService.ts` and `pose.worker.ts`.

export type PoseRunnerKind = 'worker' | 'main'

const RUNNER_KINDS: readonly PoseRunnerKind[] = ['worker', 'main']

/** Reads the `?pose=worker|main` override. Anything else means "pick automatically". */
export function getPoseRunnerOverride(search: string): PoseRunnerKind | null {
  const value = new URLSearchParams(search).get('pose')
  return (RUNNER_KINDS as readonly string[]).includes(value ?? '')
    ? (value as PoseRunnerKind)
    : null
}

/** What the worker path needs from the browser. */
export interface WorkerSupport {
  /** Module workers (`new Worker(url, { type: 'module' })`). */
  moduleWorker: boolean
  /** `createImageBitmap` from a `<video>`, to hand frames to the worker. */
  imageBitmap: boolean
  /**
   * `OffscreenCanvas` with a WebGL2 context. MediaPipe's GPU delegate needs it inside the worker,
   * and iOS Safari before 17 has `OffscreenCanvas` without WebGL.
   */
  offscreenWebgl2: boolean
}

export function supportsWorkerPath(support: WorkerSupport): boolean {
  return support.moduleWorker && support.imageBitmap && support.offscreenWebgl2
}

/**
 * The override wins, so a forced path can be traced even where auto would skip it. With no
 * override the worker runs wherever it is supported, and the main thread is the fallback.
 */
export function selectPoseRunner(
  override: PoseRunnerKind | null,
  support: WorkerSupport,
): PoseRunnerKind {
  if (override) return override
  return supportsWorkerPath(support) ? 'worker' : 'main'
}

export type PoseWorkerRequest =
  | { type: 'init'; wasmPath: string; modelPath: string }
  /** `timestampMs` is main-thread `performance.now()`: worker clocks have their own origin. */
  | { type: 'detect'; id: number; frame: ImageBitmap; timestampMs: number }

export type PoseWorkerResponse =
  | { type: 'ready'; delegate: PoseDelegate }
  | { type: 'init-error'; message: string }
  /** `inferenceMs` is `detectForVideo` alone, measured in the worker. */
  | { type: 'result'; id: number; result: RawPoseResult; inferenceMs: number }
  | { type: 'detect-error'; id: number; message: string }
