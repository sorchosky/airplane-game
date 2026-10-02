import { describe, expect, it } from 'vitest'
import {
  getPoseRunnerOverride,
  selectPoseRunner,
  supportsWorkerPath,
  type WorkerSupport,
} from './poseRunner'

const FULL: WorkerSupport = { moduleWorker: true, imageBitmap: true, offscreenWebgl2: true }

describe('getPoseRunnerOverride', () => {
  it('reads worker or main and ignores anything else', () => {
    expect(getPoseRunnerOverride('?pose=worker')).toBe('worker')
    expect(getPoseRunnerOverride('?input=pose&pose=main&debug')).toBe('main')
    expect(getPoseRunnerOverride('')).toBeNull()
    expect(getPoseRunnerOverride('?pose=gpu')).toBeNull()
  })
})

describe('selectPoseRunner', () => {
  it('uses the worker where every piece is supported', () => {
    expect(supportsWorkerPath(FULL)).toBe(true)
    expect(selectPoseRunner(null, FULL)).toBe('worker')
  })

  it('falls back to the main thread when any piece is missing', () => {
    // iOS Safari before 17: OffscreenCanvas exists but has no WebGL context.
    expect(selectPoseRunner(null, { ...FULL, offscreenWebgl2: false })).toBe('main')
    expect(selectPoseRunner(null, { ...FULL, moduleWorker: false })).toBe('main')
    expect(selectPoseRunner(null, { ...FULL, imageBitmap: false })).toBe('main')
  })

  it('lets the URL override force either path', () => {
    expect(selectPoseRunner('main', FULL)).toBe('main')
    expect(selectPoseRunner('worker', { ...FULL, offscreenWebgl2: false })).toBe('worker')
  })
})
