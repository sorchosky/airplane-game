import { describe, expect, it } from 'vitest'
import {
  BAND_WIDTH_VW,
  REVEAL_INSET_VW,
  TITLE_INTRO,
  bandLeadingEdgeVw,
  introDuration,
  revealClip,
  revealEdgeVw,
  shouldPlayIntro,
  startBeginsAt,
} from './titleIntro'

describe('title intro', () => {
  it('starts with the band fully off screen left, so nothing is revealed', () => {
    expect(bandLeadingEdgeVw(0)).toBeCloseTo(0)
    expect(revealEdgeVw(0)).toBeLessThanOrEqual(0)
    expect(revealClip(0)).toBe('polygon(0 0, -3.000vw 0, -3.000vw 100%, 0 100%)')
  })

  it('ends with the band fully off screen right and the whole title revealed', () => {
    expect(bandLeadingEdgeVw(1) - BAND_WIDTH_VW).toBeCloseTo(100)
    expect(revealEdgeVw(1)).toBeGreaterThanOrEqual(100)
  })

  it('keeps the reveal edge inside the band for the whole sweep', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const leading = bandLeadingEdgeVw(p)
      expect(revealEdgeVw(p)).toBeLessThan(leading)
      expect(revealEdgeVw(p)).toBeGreaterThan(leading - BAND_WIDTH_VW)
      expect(leading - revealEdgeVw(p)).toBeCloseTo(REVEAL_INSET_VW)
    }
  })

  it('centers the band on screen at the Figma 03 frame (half way through the sweep)', () => {
    const left = bandLeadingEdgeVw(0.5) - BAND_WIDTH_VW
    expect(left + BAND_WIDTH_VW / 2).toBeCloseTo(50)
  })

  it('moves the reveal edge monotonically', () => {
    let previous = -Infinity
    for (let p = 0; p <= 1; p += 0.05) {
      const edge = bandLeadingEdgeVw(p)
      expect(edge).toBeGreaterThan(previous)
      previous = edge
    }
  })

  it('brings Start in after the band has left and finishes within 3 s', () => {
    expect(startBeginsAt()).toBeGreaterThan(TITLE_INTRO.skyHold + TITLE_INTRO.sweep)
    expect(introDuration()).toBeLessThanOrEqual(3000)
  })

  it('plays once per load and never under reduced motion', () => {
    expect(shouldPlayIntro(false, false)).toBe(true)
    expect(shouldPlayIntro(true, false)).toBe(false)
    expect(shouldPlayIntro(false, true)).toBe(false)
  })
})
