/**
 * The longest frame the capped loop (`CastFrameLoop`) hands the scene, in seconds. Matches the
 * game clock's step limit: a real stall still reads as a stall, but no frame can carry minutes.
 */
export const MAX_CAST_FRAME_S = 0.25

/**
 * The clock time to seed before `advance(nowS)` so the frame's delta is at most `maxStepS`.
 *
 * In `frameloop="never"` R3F measures each frame's delta as `timestamp - clock.elapsedTime`, and
 * `setFrameloop` zeroes `elapsedTime` when the governor turns the cap on mid-flight. Unseeded, the
 * first capped frame's delta is the whole page uptime: the flight model steps the plane kilometres
 * in one frame and the scene stops drawing. Returns `elapsedS` unchanged for an ordinary frame.
 */
export function seededElapsed(nowS: number, elapsedS: number, maxStepS = MAX_CAST_FRAME_S): number {
  const delta = nowS - elapsedS
  if (delta < 0) return nowS
  return delta <= maxStepS ? elapsedS : nowS - maxStepS
}
