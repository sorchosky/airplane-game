/**
 * Landmark shape mirrors MediaPipe Tasks Vision's `NormalizedLandmark` (x, y, z in 0..1 image
 * space, y down; visibility 0..1) without importing the runtime package, so this module stays
 * usable before #14 (pose service) lands and has no MediaPipe dependency.
 */
export interface PoseLandmark {
  x: number
  y: number
  z: number
  visibility: number
}

/** Index order matches the 33-point BlazePose topology MediaPipe Pose Landmarker emits. */
export type PoseLandmarks = readonly PoseLandmark[]

export { LANDMARK } from './landmarks'
