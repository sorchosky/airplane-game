// The Start → Choose beat (#159): the masthead gives way to the control choice over a blurred
// version of the live world, as one move on one clock. Every number here is milliseconds from the
// Start tap; the DOM animations and the world's lean and blur all read this one table, so they
// can't drift apart, and reversing the clock reverses all of them.

interface Span {
  from: number
  to: number
}

export const START_TRANSITION = {
  /** Start and the rule fade out. */
  startFade: { from: 0, to: 300 },
  /** The wordmark shrinks to `tv-caption` scale and glides to the running head, dropping in opacity. */
  wordmark: { from: 0, to: 700 },
  /** The wordmark's opacity once it is the running head. */
  wordmarkOpacity: 0.7,
  /** The title camera leans in and the world blur ramps to full. */
  world: { from: 0, to: 900 },
  /** The header fades in, rising `headerRise` px. */
  header: { from: 400, to: 800 },
  headerRise: 8,
  /** Every frame's corner marks draw in within this span, each frame starting `frameStagger` later. */
  frames: { from: 500, to: 1100 },
  frameStagger: 80,
  /** How far outward (px) a corner mark starts from its rest position. */
  cornerTravel: 24,
  /** A frame's glyph fades in over the last part of its span, as its marks land. */
  glyphFade: 200,
  /** The low tier's still scales in by this much over the world span (a stand-in for the lean). */
  stillScale: 0.04,
  /** Reduced motion: a plain crossfade, no camera move, static blur. */
  reducedFade: 200,
} as const satisfies Record<string, number | Span>

/** Ease-out with no overshoot: the same curve as `easeOutCubic`, for the DOM animations. */
export const START_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)'

export const easeOutCubic = (x: number): number => 1 - (1 - x) ** 3

/** Linear progress of `t` through a span, clamped to 0..1. */
export function spanProgress(t: number, span: Span): number {
  if (span.to <= span.from) return t >= span.to ? 1 : 0
  return Math.min(1, Math.max(0, (t - span.from) / (span.to - span.from)))
}

/** Eased progress of `t` through a span. */
export const easedProgress = (t: number, span: Span): number => easeOutCubic(spanProgress(t, span))

/** The span frame `index` (of `count`) draws in over: staggered, all landing by `frames.to`. */
export function frameSpan(index: number, count: number): Span {
  const { frames, frameStagger } = START_TRANSITION
  const from = Math.min(frames.from + index * frameStagger, frames.to)
  return { from, to: Math.max(from, frames.to - (count - 1 - index) * frameStagger) }
}

/** The span frame `index`'s glyph fades in over: the tail of its frame span. */
export function glyphSpan(index: number, count: number): Span {
  const frame = frameSpan(index, count)
  return { from: Math.max(frame.from, frame.to - START_TRANSITION.glyphFade), to: frame.to }
}

/** Length of the whole timeline. */
export function startTransitionDuration(frameCount: number): number {
  let end = 0
  for (const span of [
    START_TRANSITION.startFade,
    START_TRANSITION.wordmark,
    START_TRANSITION.world,
    START_TRANSITION.header,
    ...Array.from({ length: frameCount }, (_, i) => frameSpan(i, frameCount)),
  ]) {
    end = Math.max(end, span.to)
  }
  return end
}

export interface StartTimelineSample {
  /** Start and the rule: 1 → 0. */
  startOpacity: number
  /** The wordmark's move from the masthead to the running head, 0..1, and its opacity. */
  wordmarkMove: number
  wordmarkOpacity: number
  /** The title camera's lean and the world blur strength, each 0..1. */
  lean: number
  blur: number
  /** The header's fade, 0..1, and its rise offset in px (starts at `headerRise`, ends at 0). */
  headerOpacity: number
  headerOffset: number
  /** Per frame: how far its corner marks have drawn in, and its glyph's opacity. */
  frames: Array<{ corners: number; glyph: number }>
}

/** Everything the timeline drives, at `t` ms. Used for the world's uniforms and by tests. */
export function sampleStartTimeline(t: number, frameCount: number): StartTimelineSample {
  const header = easedProgress(t, START_TRANSITION.header)
  const move = easedProgress(t, START_TRANSITION.wordmark)
  const world = easedProgress(t, START_TRANSITION.world)
  return {
    startOpacity: 1 - easedProgress(t, START_TRANSITION.startFade),
    wordmarkMove: move,
    wordmarkOpacity: 1 + (START_TRANSITION.wordmarkOpacity - 1) * move,
    lean: world,
    blur: world,
    headerOpacity: header,
    headerOffset: START_TRANSITION.headerRise * (1 - header),
    frames: Array.from({ length: frameCount }, (_, i) => ({
      corners: easedProgress(t, frameSpan(i, frameCount)),
      glyph: easedProgress(t, glyphSpan(i, frameCount)),
    })),
  }
}

/** A Web Animations timing for a span: `delay` and `duration` on the shared clock, ease out. */
export function spanTiming(span: Span): { delay: number; duration: number } {
  return { delay: span.from, duration: span.to - span.from }
}

/**
 * The world's look at rest in each beat: lean and blur, 0..1. The timeline eases between the two
 * ends; at rest the stage writes these directly.
 */
export function restingLook(beat: 'masthead' | 'choose' | 'position' | 'flight' | 'poster'): {
  lean: number
  blur: number
} {
  return beat === 'choose' || beat === 'position' ? { lean: 1, blur: 1 } : { lean: 0, blur: 0 }
}
