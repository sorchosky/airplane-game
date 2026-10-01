import { describe, expect, it } from 'vitest'
import { TARGET_POSE } from '../../ui/poseOverlayMath'
import {
  POSITION_DURATION_MS,
  POSITION_TRANSITION as T,
  angleFromMatrix,
  moveBetween,
  targetGlyphBox,
} from './positionTransition'

describe('position timeline', () => {
  it('moves for 700 ms after the tilt has eased out, then crossfades for 300', () => {
    expect(T.move.to - T.move.from).toBe(700)
    expect(T.tilt.to).toBeLessThanOrEqual(T.move.from)
    expect(T.fade.to - T.fade.from).toBe(300)
    expect(T.crossfade.from).toBe(T.move.to)
    expect(T.crossfade.to - T.crossfade.from).toBe(300)
    expect(T.feedFadeMs).toBe(400)
    expect(POSITION_DURATION_MS).toBe(T.crossfade.to)
  })

  it('hands the corner marks over before the move ends', () => {
    expect(T.cornerHandoff.from).toBeGreaterThanOrEqual(T.move.from)
    expect(T.cornerHandoff.to).toBe(T.move.to)
  })
})

describe('targetGlyphBox', () => {
  const frame = { left: 100, top: 20, width: 800, height: 600 }

  it('is centred on the frame and as wide as the target T-pose', () => {
    const box = targetGlyphBox(frame)
    const t = TARGET_POSE
    expect(box.left + box.width / 2).toBeCloseTo(frame.left + frame.width / 2)
    // The shoulders span 0.135 of the frame width; the wrists reach 1 + 2 × 1.55 shoulder spans.
    // The figure's outline fills 88% of its box, so the box is that much wider.
    expect(box.width * 0.88).toBeCloseTo(t.shoulderWidth * 4.1 * frame.width)
  })

  it('keeps the glyph box aspect and sits in the upper half of the frame', () => {
    const box = targetGlyphBox(frame)
    expect(box.width / box.height).toBeCloseTo(240 / 112)
    expect(box.top).toBeGreaterThan(frame.top)
    expect(box.top + box.height).toBeLessThan(frame.top + frame.height / 2 + 100)
  })

  it('scales with the frame', () => {
    const small = targetGlyphBox({ left: 0, top: 0, width: 400, height: 300 })
    const big = targetGlyphBox({ left: 0, top: 0, width: 800, height: 600 })
    expect(big.width).toBeCloseTo(small.width * 2)
  })
})

describe('moveBetween', () => {
  it('translates top left to top left and scales by width', () => {
    const move = moveBetween(
      { left: 10, top: 20, width: 24, height: 24 },
      { left: 110, top: 70, width: 12, height: 12 },
    )
    expect(move).toEqual({ dx: 100, dy: 50, scale: 0.5 })
  })

  it('does not divide by a zero width', () => {
    expect(
      moveBetween(
        { left: 0, top: 0, width: 0, height: 0 },
        targetGlyphBox({ left: 0, top: 0, width: 4, height: 3 }),
      ).scale,
    ).toBe(1)
  })
})

describe('angleFromMatrix', () => {
  it('reads the rotation of a matrix, and 0 for none', () => {
    const rad = (10 * Math.PI) / 180
    expect(
      angleFromMatrix(
        `matrix(${Math.cos(rad)}, ${Math.sin(rad)}, ${-Math.sin(rad)}, ${Math.cos(rad)}, 0, 0)`,
      ),
    ).toBeCloseTo(10)
    expect(angleFromMatrix('none')).toBe(0)
  })
})
