import { create } from 'zustand'
import type { PoseLandmarks } from './types'

export interface PoseFrame {
  /** Null when no person is currently detected. */
  landmarks: PoseLandmarks | null
  /** Timestamp of the detection, in ms, on the same clock `interpretPose` is called with. */
  timestampMs: number
}

const NO_POSE_FRAME: PoseFrame = { landmarks: null, timestampMs: 0 }

interface PoseStore {
  frame: PoseFrame
  setFrame: (frame: PoseFrame) => void
}

/**
 * Written by the pose service (#14) with each MediaPipe detection; read here by `poseSource` so
 * the gesture interpreter has something to consume before #14 lands.
 */
export const usePoseStore = create<PoseStore>((set) => ({
  frame: NO_POSE_FRAME,
  setFrame: (frame) => set({ frame }),
}))
