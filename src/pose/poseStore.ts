import { create } from 'zustand'
import type { PoseLandmarks } from './types'

/** One detected person, already mirrored into selfie space (see `poseFrame.ts`). */
export interface PoseFrame {
  /** 33 landmarks, x/y normalized 0..1 to the camera image, y down. */
  landmarks: PoseLandmarks
  /** The same 33 points in meters, origin between the hips. */
  worldLandmarks: PoseLandmarks
  /** `performance.now()` time the camera frame was detected at. */
  timestampMs: number
}

/** Model download and init progress, shown on the calibrate screen. */
export type PoseModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export type PoseDelegate = 'GPU' | 'CPU'

interface PoseStore {
  /** Latest detection result. Null when no person is in frame (or no detection has run yet). */
  frame: PoseFrame | null
  /**
   * `performance.now()` time of the latest detection, whether or not it found a person. Lets
   * readers tell a new "no person" result apart from the same stale one. 0 before the first.
   */
  detectedAtMs: number
  modelStatus: PoseModelStatus
  /** Which MediaPipe delegate the loaded model runs on, once `modelStatus` is `ready`. */
  delegate: PoseDelegate | null
  /** Smoothed wall time of one `detectForVideo` call, for the debug HUD. */
  inferenceMs: number
  /** Detections completed per second over the last sample window, for the debug HUD. */
  hz: number
}

export const INITIAL_POSE_STATE: PoseStore = {
  frame: null,
  detectedAtMs: 0,
  modelStatus: 'idle',
  delegate: null,
  inferenceMs: 0,
  hz: 0,
}

/**
 * Written by the pose service (`poseService.ts`) at the detection rate, read with `getState()`
 * from animation frame loops (`poseSource`, debug readouts). Only `modelStatus` is meant to be
 * subscribed to as React state; every other field changes up to 20 times a second.
 */
export const usePoseStore = create<PoseStore>(() => INITIAL_POSE_STATE)
