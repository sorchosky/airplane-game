import { getVideo, restart, useCameraStore } from '../pose/cameraService'
import { startPoseService, stopPoseService } from '../pose/poseService'
import { CAMERA_MUTE_GRACE_MS, cameraRetryDelayMs } from './robustness'

/**
 * Hands-free recovery when the camera drops out mid-session: while `cameraStore` reads `lost`,
 * ask for the stream again on a backoff (1 s, 2 s, 4 s, then every 8 s; a muted track first gets
 * a few seconds to come back by itself). Once it's live again the pose service restarts on it.
 * Meanwhile the pose source goes stale, the control machine drops to autopilot with the "lost the
 * camera" prompt, and pauses after 5 s as it would for a player who walked away. Call once near
 * the app root; returns its teardown.
 */
export function setupCameraRecovery(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  let recovering = false

  const schedule = (delayMs: number) => {
    clearTimeout(timer)
    timer = setTimeout(tryRestart, delayMs)
  }

  const tryRestart = () => {
    restart().then(
      () => {
        stopPoseService()
        startPoseService(getVideo()).catch(() => undefined)
      },
      () => {
        if (useCameraStore.getState().status !== 'lost') return
        attempt += 1
        schedule(cameraRetryDelayMs(attempt))
      },
    )
  }

  const unsubscribe = useCameraStore.subscribe(({ status, lostReason }) => {
    if (status === 'lost' && !recovering) {
      recovering = true
      attempt = 0
      schedule(lostReason === 'muted' ? CAMERA_MUTE_GRACE_MS : cameraRetryDelayMs(0))
    } else if (status !== 'lost' && recovering) {
      recovering = false
      clearTimeout(timer)
    }
  })

  return () => {
    unsubscribe()
    clearTimeout(timer)
  }
}
