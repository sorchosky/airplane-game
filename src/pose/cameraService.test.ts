import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getVideo,
  restart,
  setupCameraLifecycle,
  start,
  stop,
  useCameraStore,
} from './cameraService'

type FakeTrack = EventTarget & { stop: ReturnType<typeof vi.fn>; kind: string }

function fakeStream(): MediaStream & { track: FakeTrack } {
  const track: FakeTrack = Object.assign(new EventTarget(), { stop: vi.fn(), kind: 'video' })
  return {
    getTracks: () => [track as unknown as MediaStreamTrack],
    getVideoTracks: () => [track as unknown as MediaStreamTrack],
    track,
  } as unknown as MediaStream & { track: FakeTrack }
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

  describe('losing the stream', () => {
    it.each(['ended', 'mute'])('goes lost when the live track fires %s', async (event) => {
      const stream = fakeStream()
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      })
      await start()
      stream.track.dispatchEvent(new Event(event))
      expect(useCameraStore.getState().status).toBe('lost')
    })

    it('stays lost when the track ends while play() is still pending', async () => {
      const stream = fakeStream()
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      })
      let resolvePlay: () => void = () => undefined
      vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(
        () => new Promise<void>((r) => (resolvePlay = r)),
      )
      const pending = start()
      await vi.waitFor(() => expect(getVideo().srcObject).toBe(stream))
      stream.track.dispatchEvent(new Event('ended'))
      resolvePlay()
      await pending
      expect(useCameraStore.getState().status).toBe('lost')
    })

    it('comes back live on unmute', async () => {
      const stream = fakeStream()
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      })
      await start()
      stream.track.dispatchEvent(new Event('mute'))
      stream.track.dispatchEvent(new Event('unmute'))
      expect(useCameraStore.getState().status).toBe('live')
    })

    it('restart stops the dead stream and goes live on a new one', async () => {
      const first = fakeStream()
      const second = fakeStream()
      const getUserMedia = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
      await start()
      first.track.dispatchEvent(new Event('ended'))

      await restart()

      expect(first.track.stop).toHaveBeenCalled()
      expect(getVideo().srcObject).toBe(second)
      expect(useCameraStore.getState().status).toBe('live')
      // The old track is no longer watched.
      first.track.dispatchEvent(new Event('ended'))
      expect(useCameraStore.getState().status).toBe('live')
    })

    it('restart stays lost and rejects while the camera is unavailable', async () => {
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(fakeStream())
        .mockRejectedValueOnce(new DOMException('busy', 'NotReadableError'))
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
      await start()
      useCameraStore.setState({ status: 'lost' })

      await expect(restart()).rejects.toThrow()
      expect(useCameraStore.getState().status).toBe('lost')
    })

    it('restart does nothing unless the camera is lost', async () => {
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream())
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
      await start()
      await restart()
      expect(getUserMedia).toHaveBeenCalledTimes(1)
    })

    it('a stop during restart releases the new stream and stays idle', async () => {
      const second = fakeStream()
      let resolve: (s: MediaStream) => void = () => undefined
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(fakeStream())
        .mockImplementationOnce(() => new Promise<MediaStream>((r) => (resolve = r)))
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
      await start()
      useCameraStore.setState({ status: 'lost' })

      const pending = restart()
      stop()
      resolve(second)
      await pending

      expect(second.track.stop).toHaveBeenCalled()
      expect(useCameraStore.getState().status).toBe('idle')
    })
  })
})
