// Owns the one MediaStream and the one <video> element that the camera
// preview (this ticket) and the pose service (#14) both read from. Keeping
// a single shared element avoids decoding the same stream twice.

import { create } from 'zustand'
import { copy } from '../ui/copy'

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'error'

interface CameraStore {
  status: CameraStatus
  errorMessage: string | null
}

export const useCameraStore = create<CameraStore>(() => ({
  status: 'idle',
  errorMessage: null,
}))

const DENIED_MESSAGE = copy.error.cameraDenied
const GENERIC_ERROR_MESSAGE = copy.error.cameraFailed

let video: HTMLVideoElement | null = null
let stream: MediaStream | null = null

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

export async function start(): Promise<void> {
  const status = useCameraStore.getState().status
  if (status === 'starting' || status === 'live') return

  useCameraStore.setState({ status: 'starting', errorMessage: null })
  const el = getVideo()

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    })
    el.srcObject = stream
    await el.play()
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

export function stop(): void {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  if (video) {
    video.pause()
    video.srcObject = null
  }
  useCameraStore.setState({ status: 'idle', errorMessage: null })
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
