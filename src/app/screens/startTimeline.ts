import { findSharedElement, SHARED_ELEMENTS } from '../../ui/sharedElement'
import type { BeatAnimation } from '../beatTransition'
import {
  START_EASING,
  START_TRANSITION as T,
  frameSpan,
  glyphSpan,
  spanTiming,
  startTransitionDuration,
} from './startTransition'

/** Outward direction of each frame corner mark, in the order of `data-corner`. */
const CORNER_OUTWARD = { tl: [-1, -1], tr: [1, -1], bl: [-1, 1], br: [1, 1] } as const

export interface StartTimeline extends BeatAnimation {
  /** Length of the timeline, ms. */
  readonly duration: number
  readonly frameCount: number
  /** The shared clock, ms from the Start tap. */
  time: () => number
  /** Starts forward from the masthead. */
  playForward: () => void
  /** Plays back from where it is (or the end, if it has finished) to the masthead. */
  playBackward: () => void
  /** Holds the timeline at `ms` (the test hook). */
  pin: (ms: number) => void
  /** Puts the timeline at its end, held (reduced motion, or arriving at Choose without Start). */
  jumpToEnd: () => void
  /** Resumes after a pin. */
  release: () => void
}

/**
 * Builds the Start → Choose timeline over the masthead and control choice in `root` (#159), as
 * Web Animations on one shared clock (a master animation with no target). Everything is paused
 * until played, and each is `fill: both`, so reversing the clock returns every element to the
 * settled masthead and holding the end keeps the Choose beat. Transforms, `translate` and opacity
 * only. The marks and header use the `translate` property, not `transform`, so the focus slide's
 * CSS transform on the corner marks stays theirs.
 *
 * Returns null if a part isn't mounted. Call it with nothing animating on the wordmark: it
 * measures the wordmark at rest, and `runningHead` is where it ends up (`RunningHeadTarget`).
 */
export function createStartTimeline(
  root: HTMLElement,
  runningHead: HTMLElement,
): StartTimeline | null {
  const wordmark = findSharedElement(root, SHARED_ELEMENTS.wordmark)
  const start = findSharedElement(root, SHARED_ELEMENTS.start)
  const rule = findSharedElement(root, SHARED_ELEMENTS.rule)
  const scrim = findSharedElement(root, SHARED_ELEMENTS.scrim)
  const header = root.querySelector<HTMLElement>('.control-title')
  const frames = Array.from(root.querySelectorAll<HTMLElement>('.control-frame'))
  if (!wordmark || !start || !rule || !scrim || !header || frames.length === 0) return null

  const frameCount = frames.length
  const duration = startTransitionDuration(frameCount)
  const animations: Animation[] = []

  const add = (
    element: Element,
    keyframes: Keyframe[],
    span: { from: number; to: number },
  ): void => {
    const animation = element.animate(keyframes, {
      ...spanTiming(span),
      easing: START_EASING,
      fill: 'both',
    })
    animation.pause()
    animations.push(animation)
  }

  // Start, the rule and the scrim fade out; the scrim goes with the world blur that replaces it.
  add(start, [{ opacity: 1 }, { opacity: 0 }], T.startFade)
  add(rule, [{ opacity: 1 }, { opacity: 0 }], T.startFade)
  add(scrim, [{ opacity: 1 }, { opacity: 0 }], T.world)

  // The wordmark: a shared-element move, top left to top left, scaled by the font sizes.
  const first = wordmark.getBoundingClientRect()
  const last = runningHead.getBoundingClientRect()
  const scale =
    Number.parseFloat(getComputedStyle(runningHead).fontSize) /
    Number.parseFloat(getComputedStyle(wordmark).fontSize)
  add(
    wordmark,
    [
      { transform: 'none', opacity: 1, transformOrigin: '0 0' },
      {
        transform: `translate(${last.left - first.left}px, ${last.top - first.top}px) scale(${
          Number.isFinite(scale) && scale > 0 ? scale : 1
        })`,
        opacity: T.wordmarkOpacity,
        transformOrigin: '0 0',
      },
    ],
    T.wordmark,
  )

  add(
    header,
    [
      { opacity: 0, translate: `0 ${T.headerRise}px` },
      { opacity: 1, translate: '0 0' },
    ],
    T.header,
  )

  frames.forEach((frame, index) => {
    const span = frameSpan(index, frameCount)
    const glyph = glyphSpan(index, frameCount)
    for (const corner of frame.querySelectorAll<HTMLElement>('.control-corner')) {
      const [x, y] = CORNER_OUTWARD[corner.dataset.corner as keyof typeof CORNER_OUTWARD]
      add(
        corner,
        [
          { opacity: 0, translate: `${x * T.cornerTravel}px ${y * T.cornerTravel}px` },
          { opacity: 1, translate: '0 0' },
        ],
        span,
      )
    }
    for (const part of frame.querySelectorAll<HTMLElement>('.control-glyph-box, .control-label')) {
      add(part, [{ opacity: 0 }, { opacity: 1 }], glyph)
    }
  })

  // The shared clock. It has no target, so it draws nothing; its time is what everything reads.
  const master = new Animation(
    new KeyframeEffect(null, [], { duration, fill: 'both' }),
    document.timeline,
  )
  master.pause()
  master.currentTime = 0
  const all = [...animations, master]
  const seek = (ms: number) =>
    all.forEach((a) => {
      a.currentTime = ms
    })
  seek(0)

  return {
    duration,
    frameCount,
    time: () => Number(master.currentTime ?? 0),
    get finished() {
      return master.finished
    },
    playForward() {
      all.forEach((a) => {
        a.playbackRate = 1
      })
      seek(0)
      all.forEach((a) => a.play())
    },
    playBackward() {
      const at = master.playState === 'finished' ? duration : Number(master.currentTime ?? 0)
      all.forEach((a) => {
        a.playbackRate = -1
      })
      seek(at)
      all.forEach((a) => a.play())
    },
    reverse() {
      all.forEach((a) => a.reverse())
    },
    pin(ms) {
      all.forEach((a) => a.pause())
      seek(Math.min(duration, Math.max(0, ms)))
    },
    jumpToEnd() {
      all.forEach((a) => a.pause())
      seek(duration)
    },
    release() {
      all.forEach((a) => a.play())
    },
    cancel() {
      all.forEach((a) => a.cancel())
    },
  }
}
