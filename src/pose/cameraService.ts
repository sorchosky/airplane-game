// Owns the one MediaStream and the one <video> element that the camera
// preview (this ticket) and the pose service (#14) both read from. Keeping
// a single shared element avoids decoding the same stream twice.

import { create } from 'zustand'
import { copy } from '../ui/copy'

/**
 * `lost`: the stream was live and its track ended or went mute (another app took the camera, the
 * OS reclaimed it, the device was unplugged). `restart` asks for it again.
 */
export type CameraStatus = 'idle' | 'starting' | 'live' | 'lost' | 'denied' | 'error'

/** Why the camera is `lost`: a muted track may come back by itself, an ended one never does. */
export type CameraLostReason = 'ended' | 'muted'

interface CameraStore {
  status: CameraStatus
  errorMessage: string | null
  lostReason: CameraLostReason | null
}

export const useCameraStore = create<CameraStore>(() => ({
  status: 'idle',
  errorMessage: null,
  lostReason: null,
}))

const DENIED_MESSAGE = copy.error.cameraDenied
const GENERIC_ERROR_MESSAGE = copy.error.cameraFailed

let video: HTMLVideoElement | null = null
let stream: MediaStream | null = null
/** Detaches the current track's ended/mute listeners. */
let unwatchTrack: () => void = () => undefined

// The element lives off-screen (1x1, transparent) until CameraPreview
// reparents it into the visible HUD. Hidden with opacity rather than
// `display: none` so browsers keep decoding frames for the pose service.
function hideVideo(el: HTMLVideoElement): void {
  el.style.position = 'fixed'
  el.style.top = '0'
  el.style.left = '0'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
  el.style.transform = 'none'
}

function createVideo(): HTMLVideoElement {
  const el = document.createElement('video')
  el.playsInline = true
  el.muted = true
  el.autoplay = true
  el.setAttribute('aria-hidden', 'true')
  hideVideo(el)
  document.body.appendChild(el)
  return el
}

/** The single shared `<video>` element. Created lazily on first access. */
export function getVideo(): HTMLVideoElement {
  if (!video) video = createVideo()
  return video
}

const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 30 },
  },
  audio: false,
}

/**
 * Marks the camera `lost` when the live track ends or mutes, and `live` again if a muted track
 * comes back by itself. Listens only to the current stream's track.
 */
function watchTrack(current: MediaStream): void {
  unwatchTrack()
  const track = current.getVideoTracks()[0]
  if (!track) return
  const lose = (lostReason: CameraLostReason) => {
    if (stream === current)
      useCameraStore.setState({ status: 'lost', errorMessage: null, lostReason })
  }
  const onEnded = () => lose('ended')
  const onMute = () => lose('muted')
  const onUnmute = () => {
    if (stream === current && useCameraStore.getState().status === 'lost') {
      useCameraStore.setState({ status: 'live', errorMessage: null, lostReason: null })
    }
  }
  track.addEventListener('ended', onEnded)
  track.addEventListener('mute', onMute)
  track.addEventListener('unmute', onUnmute)
  unwatchTrack = () => {
    track.removeEventListener('ended', onEnded)
    track.removeEventListener('mute', onMute)
    track.removeEventListener('unmute', onUnmute)
  }
}

async function attachStream(el: HTMLVideoElement, next: MediaStream): Promise<void> {
  stream = next
  el.srcObject = next
  watchTrack(next)
  await el.play()
}

export async function start(): Promise<void> {
  const status = useCameraStore.getState().status
  if (status === 'starting' || status === 'live') return

  useCameraStore.setState({ status: 'starting', errorMessage: null })
  const el = getVideo()

  try {
    await attachStream(el, await navigator.mediaDevices.getUserMedia(CONSTRAINTS))
    // The track may already have ended (or a stop run) while `play()` was pending.
    if (useCameraStore.getState().status !== 'starting') return
    useCameraStore.setState({ status: 'live', errorMessage: null })
  } catch (err) {
    const denied = err instanceof DOMException && err.name === 'NotAllowedError'
    useCameraStore.setState({
      status: denied ? 'denied' : 'error',
      errorMessage: denied ? DENIED_MESSAGE : GENERIC_ERROR_MESSAGE,
    })
    throw err
  }
}

/**
 * After the camera is `lost`: drops the dead stream and asks for a new one on the same `<video>`,
 * so the preview and the pose service pick it up without remounting. Stays `lost` (and rejects) if
 * the camera still isn't available; the caller decides when to try again.
 */
export async function restart(): Promise<void> {
  if (useCameraStore.getState().status !== 'lost') return
  unwatchTrack()
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  const next = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
  // A stop (quit to title) during the request wins: release what we just opened.
  if (useCameraStore.getState().status !== 'lost') {
    next.getTracks().forEach((track) => track.stop())
    return
  }
  await attachStream(getVideo(), next)
  useCameraStore.setState({ status: 'live', errorMessage: null, lostReason: null })
}

export function stop(): void {
  unwatchTrack()
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  if (video) {
    video.pause()
    video.srcObject = null
  }
  useCameraStore.setState({ status: 'idle', errorMessage: null, lostReason: null })
}

/**
 * Registers the `pagehide` / `visibilitychange` handlers required by this
 * ticket. Call once near the app root (mirrors `setupWakeLockReacquire`).
 */
export function setupCameraLifecycle(): () => void {
  const onPageHide = () => stop()
  const onVisibilityChange = () => {
    if (!video) return
    if (document.hidden) {
      video.pause()
    } else if (useCameraStore.getState().status === 'live') {
      void video.play().catch(() => undefined)
    }
  }

  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
