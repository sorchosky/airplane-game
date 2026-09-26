import { useEffect } from 'react'
import { FRAME_PRIORITY, frameLoop } from '../app/frameLoop'
import { DEFAULT_CALIBRATION } from '../pose/calibration'
import { useCalibrationStore } from '../pose/calibrationStore'
import {
  DEFAULT_GESTURE_PARAMS,
  DEFAULT_GESTURE_STATE,
  interpretPose,
  predictControl,
  type ControlAxes,
  type GestureState,
} from '../pose/gesture'
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
 * Feeds each new pose detection from `poseStore` through `interpretPose` and writes the resulting
 * `ControlInput` into the input store the moment the detection lands (#66), rather than on the next
 * animation frame. Each detection is interpreted once, so the One Euro filters see real sample
 * times. Between detections the axes are extrapolated from the filters (`predictControl`). Mount
 * once, near the app root, while `?input=pose`.
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
    const predicted: ControlAxes = { roll: 0, pitch: 0 }

    const interpret = (landmarks: PoseLandmarks | null, tMs: number) => {
      const calibration = useCalibrationStore.getState().calibration ?? DEFAULT_CALIBRATION
      const { input, state } = interpretPose(landmarks, calibration, gestureState, tMs)
      gestureState = state
      useInputStore.getState().setInput(source === input.source ? input : { ...input, source })
    }

    const onDetection = (landmarks: PoseLandmarks | null, detectedAtMs: number) => {
      if (detectedAtMs === lastDetectedAtMs || detectedAtMs <= 0) return
      lastDetectedAtMs = detectedAtMs
      interpret(landmarks, detectedAtMs)
    }

    // Written synchronously inside the pose service's (or the replay's) store update: the input is
    // ready before the next frame's sim step whatever order the frame's callbacks run in.
    const unsubscribe = usePoseStore.subscribe((pose, previous) => {
      if (pose.detectedAtMs !== previous.detectedAtMs) {
        onDetection(pose.frame?.landmarks ?? null, pose.detectedAtMs)
      }
    })
    const { frame: current, detectedAtMs: currentAt } = usePoseStore.getState()
    onDetection(current?.landmarks ?? null, currentAt)

    const tick = (now: number) => {
      if (now - Math.max(lastDetectedAtMs, 0) > POSE_STALE_MS) {
        interpret(null, now)
        return
      }
      const calibration = useCalibrationStore.getState().calibration ?? DEFAULT_CALIBRATION
      if (
        predictControl(
          gestureState,
          calibration,
          now - lastDetectedAtMs,
          DEFAULT_GESTURE_PARAMS,
          predicted,
        )
      ) {
        useInputStore.getState().setPredictedAxes(predicted.roll, predicted.pitch)
      }
    }

    const removeTick = frameLoop.add(tick, FRAME_PRIORITY.input)
    return () => {
      unsubscribe()
      removeTick()
    }
  }, [enabled, source])
}
