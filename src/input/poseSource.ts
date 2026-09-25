import { useEffect } from 'react'
import { DEFAULT_CALIBRATION } from '../pose/calibration'
import { DEFAULT_GESTURE_STATE, interpretPose, type GestureState } from '../pose/gesture'
import { usePoseStore } from '../pose/poseStore'
import { useInputStore } from './inputStore'

/**
 * Reads the latest pose landmarks from `poseStore` (written by the pose service, #14) every
 * frame, runs them through `interpretPose`, and writes the resulting `ControlInput` into the
 * input store. Mount once, near the app root, while `?input=pose`.
 */
export function usePoseSource(): void {
  useEffect(() => {
    let gestureState: GestureState = DEFAULT_GESTURE_STATE
    let frame = 0

    const tick = () => {
      const { frame: poseFrame } = usePoseStore.getState()
      const { input, state } = interpretPose(
        poseFrame.landmarks,
        DEFAULT_CALIBRATION,
        gestureState,
        poseFrame.timestampMs,
      )
      gestureState = state
      useInputStore.getState().setInput(input)

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])
}
