/**
 * Per-player neutral pose, captured by the calibration flow (#17). `shoulderWidth` is a fallback
 * normalizer for frames where the live shoulder distance can't be measured (missing landmarks);
 * day-to-day roll/pitch normalization uses the live shoulder width so the gesture stays consistent
 * as the player's distance from the camera changes.
 */
export interface Calibration {
  neutralRollDeg: number
  neutralPitch: number
  shoulderWidth: number
}

/** Assumes a level T-pose is neutral. Used for every player until #17 lands. */
export const DEFAULT_CALIBRATION: Calibration = {
  neutralRollDeg: 0,
  neutralPitch: 0,
  shoulderWidth: 0.2,
}
