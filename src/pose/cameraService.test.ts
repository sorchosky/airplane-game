import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getVideo, setupCameraLifecycle, start, stop, useCameraStore } from './cameraService'

function fakeStream(): MediaStream & { track: { stop: ReturnType<typeof vi.fn> } } {
  const track = {
    stop: vi.fn(),
    kind: 'video',
  }
  return {
    getTracks: () => [track as unknown as MediaStreamTrack],
    track,
  } as unknown as MediaStream & { track: { stop: ReturnType<typeof vi.fn> } }
}

describe('cameraService', () => {
  beforeEach(() => {
    useCameraStore.setState({ status: 'idle', errorMessage: null })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })

  afterEach(() => {
    stop()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns the same shared video element on every call', () => {
    expect(getVideo()).toBe(getVideo())
  })

  it('goes idle -> starting -> live on a successful getUserMedia call', async () => {
    const stream = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const pending = start()
    expect(useCameraStore.getState().status).toBe('starting')

    await pending

    expect(useCameraStore.getState().status).toBe('live')
    expect(useCameraStore.getState().errorMessage).toBeNull()
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: 'user' }),
        audio: false,
      }),
    )
    expect(getVideo().srcObject).toBe(stream)
  })

  it('is a no-op when already starting or live', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream())
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    await start()
    await start()

    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('sets status to denied with recovery copy on a permission refusal', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('nope', 'NotAllowedError'))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    await expect(start()).rejects.toThrow()

    expect(useCameraStore.getState().status).toBe('denied')
    expect(useCameraStore.getState().errorMessage).toMatch(/camera/i)
  })

  it('sets status to error for any other failure', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('device busy'))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    await expect(start()).rejects.toThrow()

    expect(useCameraStore.getState().status).toBe('error')
    expect(useCameraStore.getState().errorMessage).toBeTruthy()
  })

  it('stops all tracks and returns to idle on stop()', async () => {
    const stream = fakeStream()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })

    await start()
    stop()

    expect(stream.track.stop).toHaveBeenCalled()
    expect(useCameraStore.getState().status).toBe('idle')
    expect(getVideo().srcObject).toBeNull()
  })

  it('stops tracks on pagehide', async () => {
    const stream = fakeStream()
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    const teardown = setupCameraLifecycle()

    await start()
    window.dispatchEvent(new Event('pagehide'))

    expect(stream.track.stop).toHaveBeenCalled()
    expect(useCameraStore.getState().status).toBe('idle')

    teardown()
  })
})
