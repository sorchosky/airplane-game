import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restart, useCameraStore } from '../pose/cameraService'
import { startPoseService, stopPoseService } from '../pose/poseService'
import { setupCameraRecovery } from './cameraRecovery'

vi.mock('../pose/cameraService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../pose/cameraService')>()
  return { ...actual, restart: vi.fn() }
})
vi.mock('../pose/poseService', () => ({
  startPoseService: vi.fn(() => Promise.resolve()),
  stopPoseService: vi.fn(),
}))

const restartMock = vi.mocked(restart)

describe('setupCameraRecovery', () => {
  let teardown: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    useCameraStore.setState({ status: 'live', errorMessage: null, lostReason: null })
    teardown = setupCameraRecovery()
  })

  afterEach(() => {
    teardown()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('retries an ended stream on a backoff until it comes back, then restarts detection', async () => {
    restartMock
      .mockRejectedValueOnce(new Error('busy'))
      .mockRejectedValueOnce(new Error('busy'))
      .mockImplementationOnce(async () => {
        useCameraStore.setState({ status: 'live', lostReason: null })
      })
    useCameraStore.setState({ status: 'lost', lostReason: 'ended' })

    await vi.advanceTimersByTimeAsync(999)
    expect(restartMock).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(restartMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(restartMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4000)
    expect(restartMock).toHaveBeenCalledTimes(3)

    expect(stopPoseService).toHaveBeenCalledTimes(1)
    expect(startPoseService).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(restartMock).toHaveBeenCalledTimes(3)
  })

  it('gives a muted track a grace period to unmute by itself', async () => {
    useCameraStore.setState({ status: 'lost', lostReason: 'muted' })
    await vi.advanceTimersByTimeAsync(2000)
    useCameraStore.setState({ status: 'live', lostReason: null })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(restartMock).not.toHaveBeenCalled()
  })

  it('stops retrying once the camera is stopped (quit to title)', async () => {
    restartMock.mockRejectedValue(new Error('busy'))
    useCameraStore.setState({ status: 'lost', lostReason: 'ended' })
    await vi.advanceTimersByTimeAsync(1000)
    useCameraStore.setState({ status: 'idle', lostReason: null })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(restartMock).toHaveBeenCalledTimes(1)
  })
})
