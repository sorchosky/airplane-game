// Runs Pose Landmarker off the main thread (#67). The main thread posts one `ImageBitmap` per
// detection and gets the raw landmarks back. Mirroring, stats and publishing stay on the main
// thread in `poseService.ts`, so both paths share them.

import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PoseDelegate } from './poseStore'
import type { PoseWorkerRequest, PoseWorkerResponse } from './poseRunner'

interface PoseWorkerScope {
  onmessage: ((event: MessageEvent<PoseWorkerRequest>) => void) | null
  postMessage(message: PoseWorkerResponse): void
  /**
   * MediaPipe loads its WASM glue with `importScripts`, which throws in a module worker, and then
   * calls `self.import(url)` if it exists. The glue is a classic script that declares a global
   * `ModuleFactory`, which a plain `import()` would scope to the module, so evaluate it as a script
   * body and publish the factory where MediaPipe looks for it.
   */
  import?: (url: string) => Promise<void>
  ModuleFactory?: unknown
}

const scope = self as unknown as PoseWorkerScope

scope.import = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`)
  const source = await response.text()
  // Same-origin script shipped from `public/mediapipe/wasm`, not user input.
  scope.ModuleFactory = new Function(`${source}\nreturn ModuleFactory`)()
}

let landmarker: PoseLandmarker | null = null

async function init(wasmPath: string, modelPath: string): Promise<PoseDelegate> {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(wasmPath)
  const create = (delegate: PoseDelegate) =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    })

  try {
    landmarker = await create('GPU')
    return 'GPU'
  } catch (err) {
    console.warn('[pose.worker] GPU delegate unavailable, falling back to CPU', err)
    landmarker = await create('CPU')
    return 'CPU'
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

scope.onmessage = ({ data }) => {
  if (data.type === 'init') {
    init(data.wasmPath, data.modelPath).then(
      (delegate) => scope.postMessage({ type: 'ready', delegate }),
      (err: unknown) => scope.postMessage({ type: 'init-error', message: message(err) }),
    )
    return
  }

  const { id, frame, timestampMs } = data
  try {
    if (!landmarker) throw new Error('detect before init')
    const startMs = performance.now()
    const result = landmarker.detectForVideo(frame, timestampMs)
    const inferenceMs = performance.now() - startMs
    scope.postMessage({
      type: 'result',
      id,
      result: { landmarks: result.landmarks, worldLandmarks: result.worldLandmarks },
      inferenceMs,
    })
  } catch (err) {
    scope.postMessage({ type: 'detect-error', id, message: message(err) })
  } finally {
    frame.close()
  }
}
