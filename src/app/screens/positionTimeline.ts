import type { BeatAnimation } from '../beatTransition'
import {
  angleFromMatrix,
  moveBetween,
  POSITION_DURATION_MS,
  POSITION_EASING,
  POSITION_TRANSITION as T,
  spanTiming,
  targetGlyphBox,
} from './positionTransition'

export interface PositionTimeline extends BeatAnimation {
  readonly duration: number
  /** The shared clock, ms from the Motion tap. */
  time: () => number
  playForward: () => void
  /** Plays back from where it is (or the end, if it has finished) to the Choose beat. */
  playBackward: () => void
  /** Holds the timeline at `ms` (the test hook). */
  pin: (ms: number) => void
  jumpToEnd: () => void
  release: () => void
}

/** The calibration frame's own corner marks, by the `data-corner` `CameraPreview` gives them. */
const CORNERS = ['tl', 'tr', 'bl', 'br'] as const

const rect = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * Builds the Choose → Position timeline (#160) over the control choice and the calibration frame
 * in `root`, as Web Animations on one master clock, like `createStartTimeline`. The Touch frame
 * and header fade; the Motion frame's four corner marks travel to the calibration frame's corners
 * and hand over to its own; the Motion glyph scales and moves to the target T-pose's box, then
 * crossfades into the target silhouette as the frame's border arrives. Only `translate`, `scale`
 * and opacity move, so the focus slide's CSS transform and the Start timeline's own animations
 * (which hold the Choose beat at its end) are left alone; reversing returns to the Choose beat.
 *
 * Call it with the Choose beat settled (`data-leaving` set, so the corner marks sit at rest) and
 * the calibration frame laid out. Returns null if a part isn't mounted, which is a hard cut.
 */
export function createPositionTimeline(root: HTMLElement): PositionTimeline | null {
  const frame = root.querySelector<HTMLElement>('[data-testid="camera-preview"]')
  const header = root.querySelector<HTMLElement>('.control-title')
  const motion = root.querySelector<HTMLElement>('.control-frame[data-mode="camera"]')
  const others = Array.from(
    root.querySelectorAll<HTMLElement>('.control-frame:not([data-mode="camera"])'),
  )
  const glyphBox = motion?.querySelector<HTMLElement>('.control-glyph-box')
  const label = motion?.querySelector<HTMLElement>('.control-label')
  const target = frame?.querySelector<HTMLCanvasElement>('canvas')
  if (!frame || !header || !motion || !glyphBox || !label || !target) return null

  const animations: Animation[] = []
  const add = (
    element: Element,
    keyframes: Keyframe[],
    span: { from: number; to: number },
    fill: FillMode = 'both',
  ) => {
    const animation = element.animate(keyframes, {
      ...spanTiming(span),
      easing: POSITION_EASING,
      fill,
    })
    animation.pause()
    animations.push(animation)
  }
  const fadeOut = (element: Element, span: { from: number; to: number }) =>
    add(element, [{ opacity: 1 }, { opacity: 0 }], span)

  fadeOut(header, T.fade)
  for (const other of others) fadeOut(other, T.fade)
  fadeOut(label, T.label)

  // The tilt loop eases to 0° first: stop the loops and ease each tilted group back upright.
  const loops = glyphBox.querySelector('svg')?.getAnimations({ subtree: true }) ?? []
  for (const loop of loops) {
    const element = (loop.effect as KeyframeEffect | null)?.target
    if (!element) continue
    const angle = angleFromMatrix(getComputedStyle(element).transform)
    loop.pause()
    add(element, [{ transform: `rotate(${angle}deg)` }, { transform: 'rotate(0deg)' }], T.tilt)
  }

  // The corner marks: top left to top left, scaled by their widths.
  const frameBox = rect(frame)
  for (const corner of CORNERS) {
    const from = motion.querySelector<HTMLElement>(`.control-corner[data-corner="${corner}"]`)
    const home = frame.querySelector<HTMLElement>(`[data-corner="${corner}"]`)
    if (!from || !home) continue
    const { dx, dy, scale } = moveBetween(rect(from), rect(home))
    add(
      from,
      [
        { translate: '0 0', scale: '1', transformOrigin: '0 0', opacity: 1 },
        { translate: `${dx}px ${dy}px`, scale: `${scale}`, transformOrigin: '0 0', opacity: 1 },
      ],
      T.move,
    )
    fadeOut(from, T.cornerHandoff)
    add(home, [{ opacity: 0 }, { opacity: 1 }], T.cornerHandoff)
  }

  // The glyph: the same move, to the target's box, then the crossfade into the silhouette.
  const glyph = moveBetween(rect(glyphBox), targetGlyphBox(frameBox))
  add(
    glyphBox,
    [
      { translate: '0 0', scale: '1', transformOrigin: '0 0' },
      { translate: `${glyph.dx}px ${glyph.dy}px`, scale: `${glyph.scale}`, transformOrigin: '0 0' },
    ],
    T.move,
  )
  add(glyphBox, [{ opacity: 1 }, { opacity: 0 }], T.crossfade)
  add(target, [{ opacity: 0 }, { opacity: 1 }], T.crossfade)
  // The frame's border and glow arrive with the crossfade; afterwards its own styles take over.
  add(
    frame,
    [{ borderColor: 'transparent', boxShadow: '0 0 0 transparent' }],
    T.crossfade,
    'backwards',
  )

  const master = new Animation(
    new KeyframeEffect(null, [], { duration: POSITION_DURATION_MS, fill: 'both' }),
    document.timeline,
  )
  master.pause()
  const all = [...animations, master]
  const seek = (ms: number) =>
    all.forEach((a) => {
      a.currentTime = ms
    })
  seek(0)

  return {
    duration: POSITION_DURATION_MS,
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
      const at =
        master.playState === 'finished' ? POSITION_DURATION_MS : Number(master.currentTime ?? 0)
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
      seek(Math.min(POSITION_DURATION_MS, Math.max(0, ms)))
    },
    jumpToEnd() {
      all.forEach((a) => a.pause())
      seek(POSITION_DURATION_MS)
    },
    release() {
      all.forEach((a) => a.play())
    },
    cancel() {
      all.forEach((a) => a.cancel())
      // The tilt loops pick up where they were stopped.
      loops.forEach((loop) => {
        if (loop.playState === 'paused') loop.play()
      })
    },
  }
}
