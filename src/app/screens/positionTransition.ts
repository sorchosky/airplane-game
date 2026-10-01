// The Choose → Position beat (#160): choosing Motion opens its frame out into the calibration
// frame in place. Every number is milliseconds from the Motion tap on one shared clock, like the
// Start timeline (`startTransition.ts`), so reversing the clock reverses the whole move.

import { HEAD_RADIUS_PER_SHOULDER, TARGET_POSE } from '../../ui/poseOverlayMath'
import type { Box } from '../../ui/sharedElement'
import { START_EASING, spanTiming } from './startTransition'

export const POSITION_TRANSITION = {
  /** The Touch (or Mouse) frame and the header fade out. */
  fade: { from: 0, to: 300 },
  /** The Motion glyph's tilt loop eases to 0° before anything moves. */
  tilt: { from: 0, to: 200 },
  /** The corner marks and glyph travel to the calibration frame: 700 ms, ease out. */
  move: { from: 200, to: 900 },
  /** The Motion label fades with the move's first half. */
  label: { from: 200, to: 500 },
  /** The travelling marks hand over to the frame's own as they land. */
  cornerHandoff: { from: 750, to: 900 },
  /** The glyph crossfades into the target silhouette, and the frame's border arrives. */
  crossfade: { from: 900, to: 1200 },
  /** Once the feed is live it fades in over this long. */
  feedFadeMs: 400,
} as const

export { START_EASING as POSITION_EASING, spanTiming }

/** Length of the whole timeline. */
export const POSITION_DURATION_MS = POSITION_TRANSITION.crossfade.to

/** The glyph's box aspect (its viewBox is 240 × 112). */
const GLYPH_ASPECT = 240 / 112
/** How much of its box's width the figure's outline spans (wrist to wrist), measured from the art. */
const GLYPH_ART_WIDTH = 0.88

/**
 * Where the Motion glyph lands inside the calibration frame: the bounding box of the target T-pose
 * (wrist to wrist, crown to hips), as a box of the glyph's own aspect centred on it and sized so the
 * figure's outline spans the target's wrists, so scaling the glyph's box uniformly makes the figure
 * become the target.
 */
export function targetGlyphBox(frame: Box): Box {
  const t = TARGET_POSE
  const unit = t.shoulderWidth * frame.width
  const span = (1 + 2 * (t.upperArm + t.forearm)) * unit
  const width = span / GLYPH_ART_WIDTH
  const top = t.shoulderY * frame.height - (t.headAboveShoulders + HEAD_RADIUS_PER_SHOULDER) * unit
  const bottom = t.shoulderY * frame.height + t.shoulderToHip * unit
  const height = width / GLYPH_ASPECT
  return {
    left: frame.left + t.centerX * frame.width - width / 2,
    top: frame.top + (top + bottom) / 2 - height / 2,
    width,
    height,
  }
}

/** The translate and uniform scale that carry a box laid out at `from` onto `to` (origin top left). */
export function moveBetween(from: Box, to: Box): { dx: number; dy: number; scale: number } {
  return {
    dx: to.left - from.left,
    dy: to.top - from.top,
    scale: from.width > 0 ? to.width / from.width : 1,
  }
}

/** The rotation in degrees a CSS `transform` matrix string carries; 0 for `none`. */
export function angleFromMatrix(transform: string): number {
  const match = /^matrix\(([^)]+)\)$/.exec(transform.trim())
  if (!match?.[1]) return 0
  const [a = 1, b = 0] = match[1].split(',').map(Number)
  return (Math.atan2(b, a) * 180) / Math.PI
}
