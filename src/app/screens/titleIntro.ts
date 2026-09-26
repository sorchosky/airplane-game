// Title intro timeline, from the Figma "Driftwing" storyboard (frames 01–07), made cinematic (#73):
//
//   01  sky only, faded up from warm white; the cirrus is already drifting
//   02  a frosted band (backdrop blur) sweeps in from the left; letters fade in under it
//   03  the band is centered over the full word, at its blurriest, the light swelling with it
//   04  the band leaves to the right, the word left behind it is crisp
//   05  title alone
//   06  Start fades in 8px low and blurred
//   07  Start settles, sharp; the sky stops animating and holds this frame
//
//   ms   0 ──── 900 ─────────────────────────── 4100 ── 4250 ───── 4950
//        fade (0–1200)
//                 sweep (eased, 3.2 s) ────────────┘      Start ─────┘
//        cirrus drifts (≤ 30 fps) ─────────────────────────────────────┘
//
// The band and the title reveal are two separate animations that must stay locked together: the
// reveal edge trails the band's leading (right) edge, so letters only ever appear inside the
// blur. Both run over the same duration, span and easing, so they can't drift apart. The eased
// curve is mirrored here in `sweepProgress` so the sky's light shift follows the same band.
//
// All positions are in vw because the band, the title row and the reveal mask share the viewport
// width.

/** ms */
export const TITLE_INTRO = {
  /** Frame 01: fade up from warm white into the sky. */
  fade: 1200,
  /** When the sweep begins; it overlaps the tail of the fade so the sky never sits idle. */
  sweepStart: 900,
  /** Frames 02–04: the band crosses the screen. */
  sweep: 3200,
  /** Pause between the band leaving (frame 05) and Start appearing. */
  startDelay: 150,
  /** Frames 06–07. */
  startDuration: 700,
} as const

/** Sweep easing: a slow lift-off and a long glide out, rather than a constant-speed pass. */
export const SWEEP_BEZIER = [0.45, 0, 0.2, 1] as const
export const SWEEP_EASING = `cubic-bezier(${SWEEP_BEZIER.join(', ')})`

/** The white fades off quickly and lets the sky settle in. */
export const FADE_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)'

/** Strong ease-out: Start arrives quickly and settles, rather than easing in from a standstill. */
export const START_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** Band width as a share of the screen: 573 px of the 874 px Figma frame. */
export const BAND_WIDTH_VW = (573 / 874) * 100

/**
 * The band's blur breathes between these over the sweep: soft as it enters, fullest over the word
 * (Figma's 8 px sits in between), soft again as it leaves.
 */
export const BAND_BLUR_PX = { min: 3, max: 10 } as const
/** The band's opacity breathes with its blur. */
export const BAND_OPACITY = { min: 0.55, max: 1 } as const
/** Each side edge of the band feathers out over this share of its width, so it has no hard edge. */
export const BAND_FEATHER = 0.1
/** Keyframes the breathing curve is sampled into (the browser interpolates linearly between). */
const BAND_SAMPLES = 12

export const START_BLUR_PX = 2
/** Start rises this far (Figma 06 → 07: 72 → 64 px below center). */
export const START_RISE_PX = 8

/** Band's left edge in vw: fully off screen left → fully off screen right. */
export const BAND_TRAVEL_VW = { from: -BAND_WIDTH_VW, to: 100 } as const

/**
 * The reveal's fully transparent edge trails the band's leading edge by this much, so it always
 * sits where the band is at full blur, past the band's feathered edge.
 */
export const REVEAL_INSET_VW = 8
/** The reveal fades letters in over this width, rather than cutting them at a hard edge. */
export const REVEAL_RAMP_VW = 10
/**
 * The reveal mask is this wide, so it covers the whole row at every edge position in the sweep.
 * It's opaque on its left half (ramping out just before the middle) and transparent on its right.
 */
export const REVEAL_MASK_VW = 400

/** Cirrus drift, in the shader's cloud-space units per second: the far layer and a faster near one. */
export const CIRRUS_DRIFT = { far: 0.05, near: 0.14 } as const
/** Peak of the warm light that travels across the sky with the band (0..1 mix toward cloud warm). */
export const LIGHT_SHIFT_MAX = 0.14
/** The sky redraws at most this often while it animates. */
export const TITLE_SKY_MAX_FPS = 30

/** When the sweep ends, ms after mount. */
export function sweepEndsAt(): number {
  return TITLE_INTRO.sweepStart + TITLE_INTRO.sweep
}

/** When Start begins, ms after mount. */
export function startBeginsAt(): number {
  return sweepEndsAt() + TITLE_INTRO.startDelay
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

const sweepEase = cubicBezier(...SWEEP_BEZIER)

/** Eased sweep progress 0..1 at `tMs` after mount (0 before the sweep, 1 after it). */
export function sweepProgress(tMs: number): number {
  return sweepEase((tMs - TITLE_INTRO.sweepStart) / TITLE_INTRO.sweep)
}

/** Where the band's leading (right) edge is, in vw, at sweep progress 0..1. */
export function bandLeadingEdgeVw(progress: number): number {
  const left = BAND_TRAVEL_VW.from + (BAND_TRAVEL_VW.to - BAND_TRAVEL_VW.from) * progress
  return left + BAND_WIDTH_VW
}

/** Where the title is fully transparent from, in vw, at sweep progress 0..1. */
export function revealEdgeVw(progress: number): number {
  return bandLeadingEdgeVw(progress) - REVEAL_INSET_VW
}

/** 0 at both ends of the sweep, 1 half way: the shape of the band's breathing and the light. */
export function breath(progress: number): number {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, progress)))
}

export function bandBlurPx(progress: number): number {
  return BAND_BLUR_PX.min + (BAND_BLUR_PX.max - BAND_BLUR_PX.min) * breath(progress)
}

export function bandOpacity(progress: number): number {
  return BAND_OPACITY.min + (BAND_OPACITY.max - BAND_OPACITY.min) * breath(progress)
}

/**
 * The band's keyframes, in (already eased) progress space: it moves linearly across them while the
 * animation's easing sets the pace, so blur and opacity breathe with where the band is on screen.
 */
export function bandKeyframes(): Keyframe[] {
  return Array.from({ length: BAND_SAMPLES + 1 }, (_, i) => {
    const p = i / BAND_SAMPLES
    const left = BAND_TRAVEL_VW.from + (BAND_TRAVEL_VW.to - BAND_TRAVEL_VW.from) * p
    const blur = `blur(${bandBlurPx(p).toFixed(2)}px)`
    return {
      offset: p,
      transform: `translateX(${left.toFixed(3)}vw)`,
      backdropFilter: blur,
      webkitBackdropFilter: blur,
      opacity: bandOpacity(p).toFixed(3),
    }
  })
}

/** CSS mask for the band: feathered at both side edges. */
export function bandMask(): string {
  const f = `${(BAND_FEATHER * 100).toFixed(1)}%`
  return `linear-gradient(90deg, transparent 0, #000 ${f}, #000 calc(100% - ${f}), transparent 100%)`
}

/** CSS mask image for the title row: opaque, a soft ramp, then transparent (see `REVEAL_MASK_VW`). */
export function revealMask(): string {
  const half = REVEAL_MASK_VW / 2
  return `linear-gradient(90deg, #000 ${half - REVEAL_RAMP_VW}vw, transparent ${half}vw)`
}

/** Mask position that puts the reveal's transparent edge at `revealEdgeVw(progress)`. */
export function revealMaskPosition(progress: number): string {
  return `${(revealEdgeVw(progress) - REVEAL_MASK_VW / 2).toFixed(3)}vw 0`
}

/**
 * The reveal's keyframes carry the whole mask (image, size and repeat are the same at both ends),
 * so the element's static style has none and the settled title is unmasked once they're dropped.
 */
export function revealKeyframes(): Keyframe[] {
  const mask = revealMask()
  const size = `${REVEAL_MASK_VW}vw 100%`
  return [0, 1].map((p) => ({
    maskImage: mask,
    webkitMaskImage: mask,
    maskSize: size,
    webkitMaskSize: size,
    maskRepeat: 'no-repeat',
    webkitMaskRepeat: 'no-repeat',
    maskPosition: revealMaskPosition(p),
    webkitMaskPosition: revealMaskPosition(p),
  }))
}

export function fadeKeyframes(): Keyframe[] {
  return [{ opacity: 1 }, { opacity: 0 }]
}

export function startKeyframes(): Keyframe[] {
  return [
    { opacity: 0, transform: `translateY(${START_RISE_PX}px)`, filter: `blur(${START_BLUR_PX}px)` },
    { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
  ]
}

/** Per-frame inputs for the title sky shader. */
export interface TitleSkyFrame {
  /** Seconds of cirrus drift (each layer multiplies this by its own rate). */
  drift: number
  /** Where the travelling light is centered, 0..1 across the screen. */
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
  const p = sweepProgress(t)
  const inSweep = t > TITLE_INTRO.sweepStart && t < sweepEndsAt()
  const bandCenterVw = bandLeadingEdgeVw(p) - BAND_WIDTH_VW / 2
  return {
    drift: t / 1000,
    lightX: bandCenterVw / 100,
    light: inSweep ? LIGHT_SHIFT_MAX * breath(p) : 0,
  }
}

/** The settled sky every static title shows. */
export function finalTitleSkyFrame(): TitleSkyFrame {
  return titleSkyFrame(introDuration())
}

/**
 * The audio swell, seconds after the intro starts: it rises under the sweep, peaks as the band
 * crosses the word (frame 03), and releases once Start has settled.
 */
export function swellTiming(): { start: number; peak: number; end: number } {
  return {
    start: TITLE_INTRO.sweepStart / 1000,
    peak: (TITLE_INTRO.sweepStart + TITLE_INTRO.sweep * 0.5) / 1000,
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
