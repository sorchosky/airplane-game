// Into flight from either path (#161): the front door hands the world to the chase camera. The
// DOM half lives here; the camera glide is pure camera math in `flight/cameraMath.ts`. Every
// number is milliseconds from the moment the game state reaches flight.

import { color } from '../../styles/tokens'
import { LOCK_IN_CONTRACT_MS } from '../../ui/lockIn'
import { findSharedElement, SHARED_ELEMENTS } from '../../ui/sharedElement'
import type { BeatAnimation } from '../beatTransition'
import type { ControlMode } from '../controlModeStore'
import { easeOutCubic, START_EASING } from './startTransition'

export const FLIGHT_TRANSITION = {
  /** Touch and Mouse: the chosen glyph's last tap, its ring expanding to the frame and fading. */
  ringMs: 400,
  /** The press that sets the ring off, the first part of `ringMs`. */
  pressMs: 120,
  /** The other frame, the header and the running head fade out. */
  fadeMs: 400,
  /** Motion: the feed and its frame shrink into the corner preview (`CameraPreview`). */
  sharedMs: LOCK_IN_CONTRACT_MS,
  /** The world blur ramps out. */
  blurMs: 600,
  /** Reduced motion: the blur's ramp is the whole crossfade into the chase framing. */
  reducedMs: 200,
} as const

/** The contact point of the Touch and Mouse glyphs, in their 240 × 112 viewBox (`controlGlyphs`). */
const CONTACT: Record<Exclude<ControlMode, 'camera'>, { x: number; y: number }> = {
  touch: { x: 106, y: 21 },
  mouse: { x: 101, y: 56 },
}
const GLYPH_VIEWBOX = { width: 240, height: 112 }

/** The blur strength `elapsed` ms into the ramp out from `from`: eased out, ending at 0. */
export function flightBlur(elapsed: number, from: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return 0
  const p = Math.max(0, elapsed) / duration
  return from * (1 - easeOutCubic(p))
}

/**
 * The diameter, px, a ring centred at (`x`, `y`) needs to reach every corner of `box`: the frame
 * size it expands to.
 */
export function ringDiameter(
  x: number,
  y: number,
  box: { left: number; top: number; width: number; height: number },
): number {
  const dx = Math.max(Math.abs(x - box.left), Math.abs(box.left + box.width - x))
  const dy = Math.max(Math.abs(y - box.top), Math.abs(box.top + box.height - y))
  return 2 * Math.hypot(dx, dy)
}

/** Several Web Animations played, reversed and cancelled as one beat animation. */
function group(animations: Animation[], cleanup: () => void): BeatAnimation {
  const finished = Promise.all(animations.map((a) => a.finished))
  finished.then(cleanup, cleanup)
  return {
    finished,
    reverse: () => animations.forEach((a) => a.reverse()),
    cancel: () => {
      animations.forEach((a) => a.cancel())
      cleanup()
    },
  }
}

/** Fades `element` out from wherever its other animations hold it (an implicit from keyframe). */
function fadeOut(element: Element, duration: number, delay = 0): Animation {
  return element.animate([{ opacity: 0 }], {
    duration,
    delay,
    easing: START_EASING,
    fill: 'forwards',
  })
}

/**
 * Touch and Mouse (#161): the chosen glyph does one last tap and its contact ring expands to the
 * frame and fades, while the other frame, the header and the running head fade out. Returns null
 * when the choice isn't mounted (a hard cut).
 */
export function createChooseExit(
  root: HTMLElement,
  mode: Exclude<ControlMode, 'camera'>,
): BeatAnimation | null {
  const chosen = root.querySelector<HTMLElement>(`.control-frame[data-mode="${mode}"]`)
  const glyphBox = chosen?.querySelector<HTMLElement>('.control-glyph-box')
  const glyph = glyphBox?.querySelector('svg')
  if (!chosen || !glyphBox || !glyph) return null
  const T = FLIGHT_TRANSITION

  const frame = chosen.getBoundingClientRect()
  const g = glyph.getBoundingClientRect()
  const contact = CONTACT[mode]
  const x = g.left + (contact.x / GLYPH_VIEWBOX.width) * g.width
  const y = g.top + (contact.y / GLYPH_VIEWBOX.height) * g.height
  const diameter = ringDiameter(x, y, frame)

  const ring = document.createElement('span')
  ring.setAttribute('aria-hidden', 'true')
  ring.dataset.testid = 'flight-ring'
  Object.assign(ring.style, {
    position: 'absolute',
    left: `${x - frame.left - diameter / 2}px`,
    top: `${y - frame.top - diameter / 2}px`,
    width: `${diameter}px`,
    height: `${diameter}px`,
    borderRadius: '50%',
    border: `2px solid ${color.accent}`,
    pointerEvents: 'none',
    transform: 'scale(0)',
    opacity: '0',
  })
  chosen.appendChild(ring)

  const animations: Animation[] = [
    glyphBox.animate([{ scale: '1' }, { scale: '0.94', offset: 0.5 }, { scale: '1' }], {
      duration: T.pressMs * 2,
      easing: 'ease-in-out',
    }),
    // The ring expands eased out and fades eased in, so it reads while it travels.
    ring.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], {
      duration: T.ringMs - T.pressMs,
      delay: T.pressMs,
      easing: START_EASING,
      fill: 'both',
    }),
    ring.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: T.ringMs - T.pressMs,
      delay: T.pressMs,
      easing: 'ease-in',
      fill: 'both',
    }),
    // The chosen frame holds until the ring has gone out, then goes with it.
    fadeOut(chosen, T.ringMs - T.pressMs, T.pressMs),
  ]
  const fading = [
    ...root.querySelectorAll<HTMLElement>(`.control-frame:not([data-mode="${mode}"])`),
    root.querySelector<HTMLElement>('.control-title'),
    findSharedElement(root, SHARED_ELEMENTS.wordmark),
  ]
  for (const element of fading) if (element) animations.push(fadeOut(element, T.fadeMs))
  return group(animations, () => ring.remove())
}

/**
 * Motion (#161): after lock-in the corner preview has taken the feed and shrinks into the corner
 * from the calibration frame's rectangle (`CameraPreview`), so the calibration frame goes at once
 * and the running head fades. Returns null when nothing is mounted (a hard cut).
 */
export function createPositionExit(root: HTMLElement): BeatAnimation | null {
  const calibrate = root.querySelector<HTMLElement>('[data-front-door="position"]')
  if (!calibrate) return null
  const animations = [
    calibrate.animate([{ opacity: 0 }, { opacity: 0 }], {
      duration: FLIGHT_TRANSITION.fadeMs,
      fill: 'both',
    }),
  ]
  const head = findSharedElement(root, SHARED_ELEMENTS.wordmark)
  if (head) animations.push(fadeOut(head, FLIGHT_TRANSITION.fadeMs))
  return group(animations, () => undefined)
}
