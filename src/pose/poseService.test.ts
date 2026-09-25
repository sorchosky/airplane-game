import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { usePoseStore as UsePoseStore } from './poseStore'

const createFromOptions = vi.fn()

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  PoseLandmarker: { createFromOptions },
}))

let usePoseStore: typeof UsePoseStore

// A fresh module graph per test, since the service caches the loaded model. The store is
// re-imported alongside it so the test reads the same instance the service writes.
async function loadService() {
  vi.resetModules()
  ;({ usePoseStore } = await import('./poseStore'))
  return import('./poseService')
}

describe('poseService', () => {
  beforeEach(() => {
    createFromOptions.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('loads the self-hosted model with a GPU delegate in VIDEO mode, one pose', async () => {
    createFromOptions.mockResolvedValue({})
    const { loadPoseModel } = await loadService()

    const pending = loadPoseModel()
    expect(usePoseStore.getState().modelStatus).toBe('loading')
    await pending

    expect(createFromOptions).toHaveBeenCalledTimes(1)
    expect(createFromOptions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        baseOptions: expect.objectContaining({
          delegate: 'GPU',
          modelAssetPath: expect.stringMatching(/mediapipe\/pose_landmarker_lite\.task$/),
        }),
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
    )
    expect(usePoseStore.getState()).toMatchObject({ modelStatus: 'ready', delegate: 'GPU' })
  })

  it('falls back to the CPU delegate when GPU init fails', async () => {
    createFromOptions.mockRejectedValueOnce(new Error('no webgl')).mockResolvedValueOnce({})
    const { loadPoseModel } = await loadService()

    await loadPoseModel()

    expect(createFromOptions).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ baseOptions: expect.objectContaining({ delegate: 'CPU' }) }),
    )
    expect(usePoseStore.getState()).toMatchObject({ modelStatus: 'ready', delegate: 'CPU' })
  })

  it('only loads once when called repeatedly', async () => {
    createFromOptions.mockResolvedValue({})
    const { loadPoseModel } = await loadService()

    await Promise.all([loadPoseModel(), loadPoseModel()])
    await loadPoseModel()

    expect(createFromOptions).toHaveBeenCalledTimes(1)
  })

  it('reports an error when both delegates fail, and allows a retry', async () => {
    createFromOptions.mockRejectedValue(new Error('offline'))
    const { loadPoseModel } = await loadService()

    await expect(loadPoseModel()).rejects.toThrow('offline')
    expect(usePoseStore.getState().modelStatus).toBe('error')

    createFromOptions.mockReset().mockResolvedValue({})
    await loadPoseModel()
    expect(usePoseStore.getState().modelStatus).toBe('ready')
  })

  it('clears the published pose on stop', async () => {
    const { stopPoseService } = await loadService()
    usePoseStore.setState({ detectedAtMs: 123, hz: 20, inferenceMs: 8 })

    stopPoseService()

    expect(usePoseStore.getState()).toMatchObject({
      frame: null,
      detectedAtMs: 0,
      hz: 0,
      inferenceMs: 0,
    })
  })
})
