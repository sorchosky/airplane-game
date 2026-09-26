import { useEffect } from 'react'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { DEFAULT_CALIBRATION } from '../pose/calibration'
import { useCalibrationStore } from '../pose/calibrationStore'
import { DEFAULT_GESTURE_STATE, interpretPose, type GestureState } from '../pose/gesture'
import { usePoseStore } from '../pose/poseStore'
import type { PoseLandmarks } from '../pose/types'
import { useInputStore } from './inputStore'
import type { ControlInput } from './types'

/**
 * If no detection has landed for this long (tab hidden, camera stalled, service stopped), treat
 * the player as out of frame so the gesture gate can time out instead of holding its last value.
 */
const POSE_STALE_MS = 250

/**
 * Feeds each new pose detection from `poseStore` (written by the pose service at 20 Hz) through
 * `interpretPose` and writes the resulting `ControlInput` into the input store. Checked every
 * animation frame, but each detection is interpreted once, so the One Euro filters see real
 * sample times rather than the same sample repeated at the render rate. Mount once, near the app
 * root, while `?input=pose`.
 */
export function usePoseSource(enabled = true): void {
  usePoseInterpreter(enabled, 'pose')
}

/**
 * The detection-to-`ControlInput` loop behind both the live pose source and the replay source
 * (which writes `poseStore` from a fixture instead of the camera). `source` is stamped on every
 * input so the rest of the game can tell a recording from a player.
 */
export function usePoseInterpreter(
  enabled: boolean,
  source: Extract<ControlInput['source'], 'pose' | 'replay'>,
): void {
  useEffect(() => {
    if (!enabled) return
    let gestureState: GestureState = DEFAULT_GESTURE_STATE
    let lastDetectedAtMs = -1

    const interpret = (landmarks: PoseLandmarks | null, tMs: number) => {
      const calibration = useCalibrationStore.getState().calibration ?? DEFAULT_CALIBRATION
      const { input, state } = interpretPose(landmarks, calibration, gestureState, tMs)
      gestureState = state
      useInputStore.getState().setInput(source === input.source ? input : { ...input, source })
    }

    const tick = (now: number) => {
      const { frame: poseFrame, detectedAtMs } = usePoseStore.getState()

      if (detectedAtMs !== lastDetectedAtMs && detectedAtMs > 0) {
        lastDetectedAtMs = detectedAtMs
        interpret(poseFrame?.landmarks ?? null, detectedAtMs)
      } else if (now - Math.max(lastDetectedAtMs, 0) > POSE_STALE_MS) {
        interpret(null, now)
      }
    }

    return frameLoop.add(tick, FRAME_PRIORITY.input)
  }, [enabled, source])
}
