import { describe, expect, it } from 'vitest'
import {
  START_TRANSITION as T,
  easeOutCubic,
  frameSpan,
  glyphSpan,
  restingLook,
  sampleStartTimeline,
  spanProgress,
  spanTiming,
  startTransitionDuration,
} from './startTransition'

describe('spans', () => {
  it('clamps progress to the span and tolerates empty spans', () => {
    expect(spanProgress(-5, { from: 100, to: 300 })).toBe(0)
    expect(spanProgress(200, { from: 100, to: 300 })).toBe(0.5)
    expect(spanProgress(900, { from: 100, to: 300 })).toBe(1)
    expect(spanProgress(0, { from: 50, to: 50 })).toBe(0)
    expect(spanProgress(50, { from: 50, to: 50 })).toBe(1)
  })

  it('eases out without overshoot', () => {
    let previous = 0
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const y = easeOutCubic(x)
      expect(y).toBeGreaterThanOrEqual(previous)
      expect(y).toBeLessThanOrEqual(1)
      previous = y
    }
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('staggers frames by 80 ms inside 500 to 1100 and lands them in step', () => {
    expect(frameSpan(0, 2)).toEqual({ from: 500, to: 1020 })
    expect(frameSpan(1, 2)).toEqual({ from: 580, to: 1100 })
    expect(frameSpan(0, 1)).toEqual({ from: 500, to: 1100 })
    for (let i = 0; i < 2; i++) {
      const glyph = glyphSpan(i, 2)
      expect(glyph.to).toBe(frameSpan(i, 2).to)
      expect(glyph.from).toBeGreaterThanOrEqual(frameSpan(i, 2).from)
    }
  })

  it('turns a span into a delay and duration', () => {
    expect(spanTiming(T.header)).toEqual({ delay: 400, duration: 400 })
  })

  it('ends at 1100 ms', () => {
    expect(startTransitionDuration(2)).toBe(1100)
  })
})

describe('sampleStartTimeline', () => {
  it('starts as the settled masthead', () => {
    const s = sampleStartTimeline(0, 2)
    expect(s.startOpacity).toBe(1)
    expect(s.wordmarkMove).toBe(0)
    expect(s.wordmarkOpacity).toBe(1)
    expect(s.lean).toBe(0)
    expect(s.blur).toBe(0)
    expect(s.headerOpacity).toBe(0)
    expect(s.headerOffset).toBe(T.headerRise)
    expect(s.frames.every((f) => f.corners === 0 && f.glyph === 0)).toBe(true)
  })

  it('ends as the Choose beat', () => {
    const s = sampleStartTimeline(1100, 2)
    expect(s.startOpacity).toBe(0)
    expect(s.wordmarkMove).toBe(1)
    expect(s.wordmarkOpacity).toBeCloseTo(0.7)
    expect(s.lean).toBe(1)
    expect(s.blur).toBe(1)
    expect(s.headerOpacity).toBe(1)
    expect(s.headerOffset).toBe(0)
    expect(s.frames.every((f) => f.corners === 1 && f.glyph === 1)).toBe(true)
  })

  it('hits the milestones the ticket names', () => {
    expect(sampleStartTimeline(300, 2).startOpacity).toBe(0)
    expect(sampleStartTimeline(700, 2).wordmarkMove).toBe(1)
    expect(sampleStartTimeline(900, 2).lean).toBe(1)
    expect(sampleStartTimeline(399, 2).headerOpacity).toBe(0)
    expect(sampleStartTimeline(800, 2).headerOpacity).toBe(1)
    expect(sampleStartTimeline(499, 2).frames[0]?.corners).toBe(0)
    expect(sampleStartTimeline(1100, 2).frames[1]?.corners).toBe(1)
  })

  it('lands each frame glyph after its marks have started drawing', () => {
    const mid = sampleStartTimeline(700, 2).frames[0]
    expect(mid?.corners).toBeGreaterThan(0)
    expect(mid?.glyph).toBe(0)
  })

  it('only ever moves forward in time, so reversing the clock reverses it', () => {
    let previous = sampleStartTimeline(0, 2)
    for (let t = 20; t <= 1100; t += 20) {
      const s = sampleStartTimeline(t, 2)
      expect(s.lean).toBeGreaterThanOrEqual(previous.lean)
      expect(s.startOpacity).toBeLessThanOrEqual(previous.startOpacity)
      expect(s.wordmarkMove).toBeGreaterThanOrEqual(previous.wordmarkMove)
      previous = s
    }
  })
})

describe('restingLook', () => {
  it('leans in and blurs for the choice and calibrate, and not otherwise', () => {
    expect(restingLook('choose')).toEqual({ lean: 1, blur: 1 })
    expect(restingLook('position')).toEqual({ lean: 1, blur: 1 })
    expect(restingLook('masthead')).toEqual({ lean: 0, blur: 0 })
    expect(restingLook('flight')).toEqual({ lean: 0, blur: 0 })
  })
})
