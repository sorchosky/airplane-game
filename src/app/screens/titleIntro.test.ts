import { describe, expect, it } from 'vitest'
import {
  INTRO_BEZIER,
  LIGHT_SHIFT_MAX,
  TITLE_INTRO,
  WORDMARK_TRACKING_EXTRA_EM,
  cubicBezier,
  finalTitleSkyFrame,
  introDuration,
  ruleBeginsAt,
  ruleKeyframes,
  shouldDrawFrame,
  shouldPlayIntro,
  startBeginsAt,
  startKeyframes,
  swellTiming,
  titleSkyFrame,
  wordmarkEndsAt,
  wordmarkKeyframes,
  wordmarkProgress,
} from './titleIntro'

const STEPS = Array.from({ length: 41 }, (_, i) => i / 40)

describe('title intro timeline', () => {
  it('fades up from white over about 1.2 s', () => {
    expect(TITLE_INTRO.fade).toBeGreaterThanOrEqual(1000)
    expect(TITLE_INTRO.fade).toBeLessThanOrEqual(1400)
  })

  it('eases the wordmark in over 1.2 s, starting before the fade is done', () => {
    expect(TITLE_INTRO.wordmark).toBe(1200)
    expect(TITLE_INTRO.wordmarkStart).toBeLessThan(TITLE_INTRO.fade)
  })

  it('draws the rule over 600 ms once the wordmark has settled, then fades Start up last', () => {
    expect(TITLE_INTRO.rule).toBe(600)
    expect(ruleBeginsAt()).toBeGreaterThanOrEqual(wordmarkEndsAt())
    expect(startBeginsAt()).toBeGreaterThanOrEqual(ruleBeginsAt() + TITLE_INTRO.rule)
    expect(introDuration()).toBe(startBeginsAt() + TITLE_INTRO.startDuration)
    expect(introDuration()).toBeLessThanOrEqual(5000)
  })

  it('plays once per load and never under reduced motion', () => {
    expect(shouldPlayIntro(false, false)).toBe(true)
    expect(shouldPlayIntro(true, false)).toBe(false)
    expect(shouldPlayIntro(false, true)).toBe(false)
  })
})

describe('intro keyframes', () => {
  it('eases the wordmark tracking in from 0.08em wider while it fades in', () => {
    const [from, to] = wordmarkKeyframes('0.14em')
    expect(WORDMARK_TRACKING_EXTRA_EM).toBe(0.08)
    expect(from?.opacity).toBe(0)
    expect(from?.letterSpacing).toBe('calc(0.14em + 0.08em)')
    expect(to?.opacity).toBe(1)
    expect(to?.letterSpacing).toBe('0.14em')
  })

  it('draws the rule from its left end to full width', () => {
    const [from, to] = ruleKeyframes()
    expect(from?.transform).toBe('scaleX(0)')
    expect(to?.transform).toBe('scaleX(1)')
  })

  it('fades Start up from below', () => {
    const [from, to] = startKeyframes()
    expect(from?.opacity).toBe(0)
    expect(String(from?.transform)).toMatch(/translateY\(\d+px\)/)
    expect(to?.opacity).toBe(1)
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

  it('pins the ends and never runs backwards, so the one easing has no bounce', () => {
    const ease = cubicBezier(...INTRO_BEZIER)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    let previous = -Infinity
    for (const t of STEPS) {
      expect(ease(t)).toBeGreaterThanOrEqual(previous)
      expect(ease(t)).toBeLessThanOrEqual(1)
      previous = ease(t)
    }
  })
})

describe('title sky frames', () => {
  it('drifts the cirrus for the whole intro, then holds the final frame', () => {
    expect(titleSkyFrame(1000).drift).toBeGreaterThan(titleSkyFrame(0).drift)
    expect(titleSkyFrame(introDuration() + 5000)).toEqual(finalTitleSkyFrame())
  })

  it('lights the sky only while the wordmark eases in, peaking half way', () => {
    expect(titleSkyFrame(TITLE_INTRO.wordmarkStart - 1).light).toBe(0)
    expect(finalTitleSkyFrame().light).toBe(0)
    const midMs = TITLE_INTRO.wordmarkStart + TITLE_INTRO.wordmark / 2
    const mid = titleSkyFrame(midMs)
    expect(mid.light).toBeCloseTo(LIGHT_SHIFT_MAX * Math.sin(Math.PI * wordmarkProgress(midMs)))
    expect(mid.light).toBeLessThanOrEqual(LIGHT_SHIFT_MAX)
  })

  it('keeps the light over the masthead column in the left third', () => {
    expect(titleSkyFrame(TITLE_INTRO.wordmarkStart + 300).lightX).toBeLessThan(1 / 3)
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
  it('rises with the wordmark, peaks half way through it, and releases after Start', () => {
    const { start, peak, end } = swellTiming()
    expect(start * 1000).toBe(TITLE_INTRO.wordmarkStart)
    expect(peak).toBeGreaterThan(start)
    expect(peak * 1000).toBeLessThan(wordmarkEndsAt())
    expect(end * 1000).toBeGreaterThan(introDuration())
  })
})
