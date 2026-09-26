import { describe, expect, it } from 'vitest'
import {
  BAND_BLUR_PX,
  BAND_FEATHER,
  BAND_OPACITY,
  BAND_WIDTH_VW,
  LIGHT_SHIFT_MAX,
  REVEAL_MASK_VW,
  REVEAL_RAMP_VW,
  SWEEP_BEZIER,
  TITLE_HANDOFF,
  TITLE_INTRO,
  bandBlurPx,
  bandKeyframes,
  bandLeadingEdgeVw,
  bandOpacity,
  cubicBezier,
  finalTitleSkyFrame,
  introDuration,
  revealEdgeVw,
  revealMaskPosition,
  shouldDrawFrame,
  shouldPlayIntro,
  startBeginsAt,
  sweepEndsAt,
  sweepProgress,
  swellTiming,
  titleSkyFrame,
} from './titleIntro'

const STEPS = Array.from({ length: 41 }, (_, i) => i / 40)

describe('title intro timeline', () => {
  it('fades up from white over about 1.2 s', () => {
    expect(TITLE_INTRO.fade).toBeGreaterThanOrEqual(1000)
    expect(TITLE_INTRO.fade).toBeLessThanOrEqual(1400)
  })

  it('sweeps for about 3.2 s, starting before the fade is done', () => {
    expect(TITLE_INTRO.sweep).toBeGreaterThanOrEqual(3000)
    expect(TITLE_INTRO.sweep).toBeLessThanOrEqual(3400)
    expect(TITLE_INTRO.sweepStart).toBeLessThan(TITLE_INTRO.fade)
  })

  it('brings Start in after the band has left and is done within the 5 s frame strip', () => {
    expect(startBeginsAt()).toBeGreaterThan(sweepEndsAt())
    expect(introDuration()).toBeLessThanOrEqual(5000)
  })

  it('plays once per load and never under reduced motion', () => {
    expect(shouldPlayIntro(false, false)).toBe(true)
    expect(shouldPlayIntro(true, false)).toBe(false)
    expect(shouldPlayIntro(false, true)).toBe(false)
  })

  it('finishes the hand-off in under 1.5 s so Start never feels like a wait', () => {
    expect(TITLE_HANDOFF.duration).toBeLessThanOrEqual(1500)
    expect(TITLE_HANDOFF.wordmark).toBeLessThan(TITLE_HANDOFF.duration)
  })
})

describe('cubicBezier', () => {
  it('matches the CSS keywords at known points', () => {
    const linear = cubicBezier(0, 0, 1, 1)
    for (const t of STEPS) expect(linear(t)).toBeCloseTo(t, 4)
    // CSS `ease-in-out` is symmetric about its midpoint.
    const easeInOut = cubicBezier(0.42, 0, 0.58, 1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 4)
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 4)
  })

  it('pins the ends and never runs backwards', () => {
    const ease = cubicBezier(...SWEEP_BEZIER)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    let previous = -Infinity
    for (const t of STEPS) {
      expect(ease(t)).toBeGreaterThanOrEqual(previous)
      previous = ease(t)
    }
  })

  it('eases the sweep: slower than linear at the start, still gliding at the end', () => {
    const ease = cubicBezier(...SWEEP_BEZIER)
    expect(ease(0.15)).toBeLessThan(0.15)
    expect(ease(0.9)).toBeGreaterThan(0.9)
  })
})

describe('title band and reveal', () => {
  it('starts with the band fully off screen left, so nothing is revealed', () => {
    expect(bandLeadingEdgeVw(0)).toBeCloseTo(0)
    expect(revealEdgeVw(0)).toBeLessThanOrEqual(0)
  })

  it('ends with the band fully off screen right and the whole title revealed', () => {
    expect(bandLeadingEdgeVw(1) - BAND_WIDTH_VW).toBeCloseTo(100)
    expect(revealEdgeVw(1) - REVEAL_RAMP_VW).toBeGreaterThanOrEqual(100)
  })

  it('keeps the whole soft reveal ramp under the band at full blur, past its feathered edge', () => {
    const feather = BAND_WIDTH_VW * BAND_FEATHER
    for (const p of STEPS) {
      const leading = bandLeadingEdgeVw(p)
      const trailingSolid = leading - BAND_WIDTH_VW + feather
      expect(revealEdgeVw(p)).toBeLessThanOrEqual(leading - feather)
      expect(revealEdgeVw(p) - REVEAL_RAMP_VW).toBeGreaterThan(trailingSolid)
    }
  })

  it('keeps the reveal mask covering the whole row at every point of the sweep', () => {
    for (const p of STEPS) {
      const left = Number.parseFloat(revealMaskPosition(p))
      expect(left).toBeLessThanOrEqual(0)
      expect(left + REVEAL_MASK_VW).toBeGreaterThanOrEqual(100)
    }
  })

  it('centers the band on screen half way through the sweep (frame 03)', () => {
    const left = bandLeadingEdgeVw(0.5) - BAND_WIDTH_VW
    expect(left + BAND_WIDTH_VW / 2).toBeCloseTo(50)
  })

  it('breathes: blur and opacity are softest at the ends and fullest over the word', () => {
    expect(bandBlurPx(0)).toBeCloseTo(BAND_BLUR_PX.min)
    expect(bandBlurPx(1)).toBeCloseTo(BAND_BLUR_PX.min)
    expect(bandBlurPx(0.5)).toBeCloseTo(BAND_BLUR_PX.max)
    expect(bandOpacity(0)).toBeCloseTo(BAND_OPACITY.min)
    expect(bandOpacity(0.5)).toBeCloseTo(BAND_OPACITY.max)
  })

  it('samples the band into ordered keyframes that span the full travel', () => {
    const frames = bandKeyframes()
    expect(frames[0]?.offset).toBe(0)
    expect(frames.at(-1)?.offset).toBe(1)
    for (let i = 1; i < frames.length; i += 1) {
      expect(Number(frames[i]?.offset)).toBeGreaterThan(Number(frames[i - 1]?.offset))
    }
  })
})

describe('title sky frames', () => {
  it('drifts the cirrus for the whole intro, then holds the final frame', () => {
    expect(titleSkyFrame(1000).drift).toBeGreaterThan(titleSkyFrame(0).drift)
    expect(titleSkyFrame(introDuration() + 5000)).toEqual(finalTitleSkyFrame())
  })

  it('lights the sky only during the sweep, peaking with the band over the word', () => {
    expect(titleSkyFrame(TITLE_INTRO.sweepStart - 1).light).toBe(0)
    expect(finalTitleSkyFrame().light).toBe(0)
    const midSweepMs = TITLE_INTRO.sweepStart + TITLE_INTRO.sweep / 2
    const mid = titleSkyFrame(midSweepMs)
    expect(mid.light).toBeCloseTo(LIGHT_SHIFT_MAX * Math.sin(Math.PI * sweepProgress(midSweepMs)))
    expect(mid.light).toBeLessThanOrEqual(LIGHT_SHIFT_MAX)
  })

  it('moves the light across the screen with the band', () => {
    let previous = -Infinity
    for (let t = TITLE_INTRO.sweepStart; t <= sweepEndsAt(); t += 200) {
      const { lightX } = titleSkyFrame(t)
      expect(lightX).toBeGreaterThanOrEqual(previous)
      previous = lightX
    }
  })

  it('caps the redraw at 30 fps on a 60 Hz display', () => {
    const frame = 1000 / 60
    let last = -Infinity
    let draws = 0
    for (let i = 0; i < 60; i += 1) {
      const now = i * frame
      if (shouldDrawFrame(now, last)) {
        draws += 1
        last = now
      }
    }
    expect(draws).toBe(30)
  })
})

describe('title swell', () => {
  it('rises with the sweep, peaks as the band crosses the word, and releases after Start', () => {
    const { start, peak, end } = swellTiming()
    expect(start * 1000).toBe(TITLE_INTRO.sweepStart)
    expect(peak).toBeGreaterThan(start)
    expect(peak * 1000).toBeLessThan(sweepEndsAt())
    expect(end * 1000).toBeGreaterThan(introDuration())
  })
})
