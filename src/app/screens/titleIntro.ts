// Title intro timeline, from the Figma "Driftwing" storyboard (frames 01–07):
//
//   01  sky only
//   02  a frosted band (backdrop blur) sweeps in from the left; letters appear under it
//   03  the band is centered over the full word
//   04  the band leaves to the right, the word left behind it is crisp
//   05  title alone
//   06  Start fades in 8px low and blurred
//   07  Start settles, sharp
//
// The band and the title reveal are two separate animations that must stay locked together: the
// title is clipped at the band's leading (right) edge, so letters only ever appear inside the
// blur. Both are linear over the same duration and span, so they can't drift apart. Linear is
// also the right curve for this: the band enters and exits fully off screen, so the viewer only
// ever sees it cross at a constant speed, like a cloud passing.
//
// All positions are in vw because the band, the title row and the clip share the viewport width.

/** ms */
export const TITLE_INTRO = {
  /** Frame 01: sky alone before the sweep starts. */
  skyHold: 400,
  /** Frames 02–04: the band crosses the screen. */
  sweep: 1800,
  /** Pause between the band leaving (frame 05) and Start appearing. */
  startDelay: 150,
  /** Frames 06–07. */
  startDuration: 600,
} as const

/** Band width as a share of the screen: 573 px of the 874 px Figma frame. */
export const BAND_WIDTH_VW = (573 / 874) * 100

/** Figma blur values, px. */
export const BAND_BLUR_PX = 8
export const START_BLUR_PX = 2
/** Start rises this far (Figma 06 → 07: 72 → 64 px below center). */
export const START_RISE_PX = 8

/** Strong ease-out: Start arrives quickly and settles, rather than easing in from a standstill. */
export const START_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** Band's left edge in vw: fully off screen left → fully off screen right. */
export const BAND_TRAVEL_VW = { from: -BAND_WIDTH_VW, to: 100 } as const

/**
 * The reveal edge trails the band's leading edge by this much, so the clip's hard edge is always
 * well inside the blur. Right at the band's boundary the blur fades out and a half-revealed letter
 * would show a sharp vertical cut.
 */
export const REVEAL_INSET_VW = 3

/** Where the band's leading (right) edge is, in vw, at sweep progress 0..1. */
export function bandLeadingEdgeVw(progress: number): number {
  const left = BAND_TRAVEL_VW.from + (BAND_TRAVEL_VW.to - BAND_TRAVEL_VW.from) * progress
  return left + BAND_WIDTH_VW
}

/** Where the title is revealed up to, in vw, at sweep progress 0..1. */
export function revealEdgeVw(progress: number): number {
  return bandLeadingEdgeVw(progress) - REVEAL_INSET_VW
}

/** Title reveal clip at sweep progress 0..1: everything left of the reveal edge. */
export function revealClip(progress: number): string {
  const edge = `${revealEdgeVw(progress).toFixed(3)}vw`
  return `polygon(0 0, ${edge} 0, ${edge} 100%, 0 100%)`
}

export function bandKeyframes(): Keyframe[] {
  return [
    { transform: `translateX(${BAND_TRAVEL_VW.from.toFixed(3)}vw)` },
    { transform: `translateX(${BAND_TRAVEL_VW.to.toFixed(3)}vw)` },
  ]
}

export function revealKeyframes(): Keyframe[] {
  return [{ clipPath: revealClip(0) }, { clipPath: revealClip(1) }]
}

export function startKeyframes(): Keyframe[] {
  return [
    { opacity: 0, transform: `translateY(${START_RISE_PX}px)`, filter: `blur(${START_BLUR_PX}px)` },
    { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
  ]
}

/** When Start begins, ms after mount. */
export function startBeginsAt(): number {
  return TITLE_INTRO.skyHold + TITLE_INTRO.sweep + TITLE_INTRO.startDelay
}

/** Whole intro length, ms. */
export function introDuration(): number {
  return startBeginsAt() + TITLE_INTRO.startDuration
}

/**
 * The intro plays once per page load. Coming back to the title (Quit, a camera error) or the
 * brief `permission` remount after Start shows the finished screen instead of replaying it.
 */
export function shouldPlayIntro(alreadyPlayed: boolean, prefersReducedMotion: boolean): boolean {
  return !alreadyPlayed && !prefersReducedMotion
}
