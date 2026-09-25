/**
 * Indices into the 33-point BlazePose topology that MediaPipe Pose Landmarker emits. Only the
 * points used downstream are named; the rest (face, hands, legs) are ignored. "Left" and "right"
 * are the player's own left and right, which MediaPipe keeps even after the pose service mirrors
 * x into selfie space, so the player's left arm always sits on the left of the mirrored preview.
 */
export const LANDMARK = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const

export type LandmarkName = keyof typeof LANDMARK
export type LandmarkIndex = (typeof LANDMARK)[LandmarkName]

/** Number of landmarks in every pose MediaPipe Pose Landmarker returns. */
export const LANDMARK_COUNT = 33
