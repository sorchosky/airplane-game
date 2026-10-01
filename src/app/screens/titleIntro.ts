// Title intro timeline (#158): the editorial masthead over the live flyby.
//
//   01  sky only, faded up from warm white; the cirrus is already drifting
//   02  the wordmark fades in while its tracking eases in from slightly wider
//   03  the hairline rule draws left to right under it
//   04  Start fades up last; the sky stops animating and holds this frame
//
//   ms   0 ──── 900 ───── 2100 ── 2700 ─────── 3400
//        fade (0–1200)
//                 wordmark ──┘
//                            rule ──┘
//                                   Start ─────┘
//        cirrus drifts (≤ 30 fps) ────────────────┘
//
// Every step uses the one easing (`INTRO_EASING`), with no overshoot. The steps run in sequence so
// the rule never measures a wordmark that is still tracking in.

/** ms */
export const TITLE_INTRO = {
  /** Fade up from warm white into the sky. */
  fade: 1200,
  /** When the wordmark begins; it overlaps the tail of the fade so the sky never sits idle. */
  wordmarkStart: 900,
  /** Wordmark fade and tracking ease. */
  wordmark: 1200,
  /** The rule draws left to right. */
  rule: 600,
  /** Start fades up. */
  startDuration: 700,
} as const

/** The single easing for the whole intro: a quick start and a long settle, no bounce. */
export const INTRO_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)'
export const INTRO_BEZIER = [0.33, 0, 0.2, 1] as const

/** The wordmark's tracking eases in from this much wider than `trackingDisplay`. */
export const WORDMARK_TRACKING_EXTRA_EM = 0.08

/** Start rises this far while it fades up. */
export const START_RISE_PX = 8

/** Cirrus drift, in the shader's cloud-space units per second: the far layer and a faster near one. */
export const CIRRUS_DRIFT = { far: 0.05, near: 0.14 } as const
/** Peak of the warm light that swells behind the masthead with the wordmark (0..1 mix toward cloud warm). */
export const LIGHT_SHIFT_MAX = 0.14
/** Where that light is centered across the screen: the middle of the masthead column. */
export const MASTHEAD_LIGHT_X = 0.17
/** The sky redraws at most this often while it animates. */
export const TITLE_SKY_MAX_FPS = 30

/** When the wordmark ends, ms after mount. */
export function wordmarkEndsAt(): number {
  return TITLE_INTRO.wordmarkStart + TITLE_INTRO.wordmark
}

/** When the rule starts drawing, ms after mount. */
export function ruleBeginsAt(): number {
  return wordmarkEndsAt()
}

/** When Start begins, ms after mount. */
export function startBeginsAt(): number {
  return ruleBeginsAt() + TITLE_INTRO.rule
}

/** Whole intro length, ms. The sky animates until this point, then holds. */
export function introDuration(): number {
  return startBeginsAt() + TITLE_INTRO.startDuration
}

/**
 * CSS `cubic-bezier()` as a function of time 0..1 → progress, so script-driven parts of the intro
 * (the sky's light shift) follow exactly the curve the Web Animations use.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bez = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3
  const slope = (a: number, b: number, s: number) =>
    3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2
  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    // Newton's method on x(s) = t, falling back to bisection when the slope flattens.
    let s = t
    for (let i = 0; i < 8; i += 1) {
      const dx = slope(x1, x2, s)
      if (Math.abs(dx) < 1e-6) break
      const next = s - (bez(x1, x2, s) - t) / dx
      if (next < 0 || next > 1) break
      s = next
    }
    if (Math.abs(bez(x1, x2, s) - t) > 1e-5) {
      let lo = 0
      let hi = 1
      for (let i = 0; i < 30; i += 1) {
        s = (lo + hi) / 2
        if (bez(x1, x2, s) < t) lo = s
        else hi = s
      }
    }
    return bez(y1, y2, s)
  }
}

const introEase = cubicBezier(...INTRO_BEZIER)

/** Eased wordmark progress 0..1 at `tMs` after mount (0 before it starts, 1 once it has settled). */
export function wordmarkProgress(tMs: number): number {
  return introEase((tMs - TITLE_INTRO.wordmarkStart) / TITLE_INTRO.wordmark)
}

/** 0 at both ends, 1 half way: the shape of the light's swell. */
export function breath(progress: number): number {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, progress)))
}

export function fadeKeyframes(): Keyframe[] {
  return [{ opacity: 1 }, { opacity: 0 }]
}

/** The wordmark fades in while its tracking eases from `trackingDisplay` + 0.08em to `trackingDisplay`. */
export function wordmarkKeyframes(tracking: string): Keyframe[] {
  return [
    { opacity: 0, letterSpacing: `calc(${tracking} + ${WORDMARK_TRACKING_EXTRA_EM}em)` },
    { opacity: 1, letterSpacing: tracking },
  ]
}

/** The rule draws from its left end. It sits at full width in its static style. */
export function ruleKeyframes(): Keyframe[] {
  return [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }]
}

export function startKeyframes(): Keyframe[] {
  return [
    { opacity: 0, transform: `translateY(${START_RISE_PX}px)` },
    { opacity: 1, transform: 'translateY(0)' },
  ]
}

/** Per-frame inputs for the title sky shader. */
export interface TitleSkyFrame {
  /** Seconds of cirrus drift (each layer multiplies this by its own rate). */
  drift: number
  /** Where the warm light is centered, 0..1 across the screen. */
  lightX: number
  /** How strong it is, 0..`LIGHT_SHIFT_MAX`. */
  light: number
}

/**
 * The sky at `tMs` after the intro started. After the intro it holds the final frame, which is
 * also what a skipped intro (reduced motion, a return to the title) shows from the start.
 */
export function titleSkyFrame(tMs: number): TitleSkyFrame {
  const t = Math.min(Math.max(tMs, 0), introDuration())
  const inReveal = t > TITLE_INTRO.wordmarkStart && t < wordmarkEndsAt()
  return {
    drift: t / 1000,
    lightX: MASTHEAD_LIGHT_X,
    light: inReveal ? LIGHT_SHIFT_MAX * breath(wordmarkProgress(t)) : 0,
  }
}

/** The settled sky every static title shows. */
export function finalTitleSkyFrame(): TitleSkyFrame {
  return titleSkyFrame(introDuration())
}

/** The audio swell, seconds after the intro starts: it rises with the wordmark and releases after Start. */
export function swellTiming(): { start: number; peak: number; end: number } {
  return {
    start: TITLE_INTRO.wordmarkStart / 1000,
    peak: (TITLE_INTRO.wordmarkStart + TITLE_INTRO.wordmark * 0.5) / 1000,
    end: (introDuration() + 1200) / 1000,
  }
}

/** Should the redraw loop draw at `now`, given it last drew at `last`? Caps it at `maxFps`. */
export function shouldDrawFrame(now: number, last: number, maxFps = TITLE_SKY_MAX_FPS): boolean {
  // A millisecond of slack so a 60 Hz display reliably lands on every other frame.
  return now - last >= 1000 / maxFps - 1
}

/**
 * The intro plays once per page load. Coming back to the title (Quit, a camera error) or the
 * brief `permission` remount after Start shows the finished screen instead of replaying it.
 */
export function shouldPlayIntro(alreadyPlayed: boolean, prefersReducedMotion: boolean): boolean {
  return !alreadyPlayed && !prefersReducedMotion
}

// Hand-off (Start → the next screen). The title's last frame is kept as a still over whatever
// mounts next and the viewer's camera sinks through it: the cirrus slides up and swells past, a
// light veil (the world's horizon colour) rises as it passes through the cloud, and the whole
// layer fades to reveal the live scene underneath. CSS only, on a snapshot of the sky, so the R3F
// canvas boots without a second WebGL context competing with it.

/** ms */
export const TITLE_HANDOFF = {
  duration: 1400,
  /** The wordmark and Start lift away and fade over this. */
  wordmark: 600,
} as const

/** Ease-in-out: leaves gently, accelerates through the cloud, lands gently. */
export const HANDOFF_EASING = 'cubic-bezier(0.55, 0, 0.35, 1)'

export function handoffSkyKeyframes(): Keyframe[] {
  return [
    { transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
    { transform: 'translateY(-18%) scale(1.35)', filter: 'blur(2px)', offset: 0.55 },
    { transform: 'translateY(-40%) scale(1.8)', filter: 'blur(6px)' },
  ]
}

export function handoffVeilKeyframes(): Keyframe[] {
  return [{ opacity: 0 }, { opacity: 0.75, offset: 0.5 }, { opacity: 0 }]
}

export function handoffLayerKeyframes(): Keyframe[] {
  return [{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }]
}

export function handoffWordmarkKeyframes(): Keyframe[] {
  return [
    { opacity: 1, transform: 'translateY(0)' },
    { opacity: 0, transform: 'translateY(-12vh)' },
  ]
}
