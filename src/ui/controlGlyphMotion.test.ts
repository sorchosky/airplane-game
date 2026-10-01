import { describe, expect, it } from 'vitest'
import {
  easeSine,
  motionHeadDeg,
  motionTiltDeg,
  MOTION_LOOP_MS,
  sampleKeyframes,
  TOUCH_ARC_PX,
  TOUCH_CYCLE_MS,
  TOUCH_DRAG_PX,
  TOUCH_LOOP_MS,
  TOUCH_PRESS_PX,
  TOUCH_PRESS_SCALE,
  TOUCH_RING_RADIUS,
  TOUCH_STATIC_MS,
  touchFrame,
} from './controlGlyphMotion'

describe('easeSine', () => {
  it('runs 0 to 1, symmetric, and clamps', () => {
    expect(easeSine(0)).toBe(0)
    expect(easeSine(1)).toBeCloseTo(1)
    expect(easeSine(0.5)).toBeCloseTo(0.5)
    expect(easeSine(-1)).toBe(0)
    expect(easeSine(2)).toBeCloseTo(1)
  })
})

describe('motion tilt', () => {
  it('takes 3.6 s through 0, -10, 0, +10, 0 with 400 ms holds at the extremes', () => {
    expect(MOTION_LOOP_MS).toBe(3600)
    expect(motionTiltDeg(0)).toBeCloseTo(0)
    expect(motionTiltDeg(700)).toBeCloseTo(-10)
    expect(motionTiltDeg(900)).toBeCloseTo(-10)
    expect(motionTiltDeg(1100)).toBeCloseTo(-10)
    expect(motionTiltDeg(1800)).toBeCloseTo(0)
    expect(motionTiltDeg(2500)).toBeCloseTo(10)
    expect(motionTiltDeg(2700)).toBeCloseTo(10)
    expect(motionTiltDeg(2900)).toBeCloseTo(10)
    expect(motionTiltDeg(3600)).toBeCloseTo(0)
  })

  it('is periodic and never exceeds 10 degrees', () => {
    for (let t = 0; t < MOTION_LOOP_MS; t += 50) {
      expect(motionTiltDeg(t + MOTION_LOOP_MS)).toBeCloseTo(motionTiltDeg(t))
      expect(Math.abs(motionTiltDeg(t))).toBeLessThanOrEqual(10 + 1e-9)
    }
  })

  it('counter-tilts the head by 3 degrees at the extremes', () => {
    expect(motionHeadDeg(10)).toBeCloseTo(-3)
    expect(motionHeadDeg(-10)).toBeCloseTo(3)
    expect(motionHeadDeg(0)).toBeCloseTo(0)
  })
})

describe('touch loop', () => {
  it('rests with the hand up and nothing drawn at the start', () => {
    const f = touchFrame(0)
    expect(f.handY).toBe(0)
    expect(f.handScale).toBe(1)
    expect(f.dotOpacity).toBe(0)
    expect(f.ringOpacity).toBe(0)
    expect(f.trailOpacity).toBe(0)
    expect(f.handX).toBeCloseTo(-TOUCH_DRAG_PX / 2)
  })

  it('presses 6 px down and to 0.97 over 160 ms', () => {
    const f = touchFrame(760)
    expect(f.handY).toBeCloseTo(TOUCH_PRESS_PX)
    expect(f.handScale).toBeCloseTo(TOUCH_PRESS_SCALE)
    expect(f.dotOpacity).toBeCloseTo(1)
    expect(touchFrame(680).handY).toBeGreaterThan(0)
    expect(touchFrame(680).handY).toBeLessThan(TOUCH_PRESS_PX)
  })

  it('expands the contact ring to 28 px while fading out over 500 ms', () => {
    const mid = touchFrame(1010)
    expect(mid.ringScale * TOUCH_RING_RADIUS).toBeGreaterThan(0)
    expect(mid.ringOpacity).toBeGreaterThan(0)
    expect(mid.ringOpacity).toBeLessThan(1)
    const end = touchFrame(1259)
    expect(end.ringScale * TOUCH_RING_RADIUS).toBeCloseTo(TOUCH_RING_RADIUS, 0)
    expect(end.ringOpacity).toBeCloseTo(0, 1)
    expect(touchFrame(1300).ringOpacity).toBe(0)
  })

  it('drags 40 px along a shallow arc over 900 ms, and the trail follows the dot', () => {
    const start = touchFrame(1260)
    const mid = touchFrame(1710)
    const end = touchFrame(2160)
    expect(end.handX - start.handX).toBeCloseTo(TOUCH_DRAG_PX)
    expect(mid.handX).toBeCloseTo(0)
    expect(mid.dotY).toBeCloseTo(-TOUCH_ARC_PX)
    expect(end.dotY).toBeCloseTo(0)
    expect(mid.trailOpacity).toBe(1)
    expect(mid.trailLength).toBeCloseTo(Math.hypot(TOUCH_DRAG_PX / 2, TOUCH_ARC_PX))
    expect(end.trailLength).toBeCloseTo(TOUCH_DRAG_PX)
  })

  it('fades the trail over 400 ms after the drag, then lifts and fades the dot', () => {
    expect(touchFrame(2160).trailOpacity).toBeCloseTo(1)
    expect(touchFrame(2360).trailOpacity).toBeCloseTo(0.5)
    expect(touchFrame(2560).trailOpacity).toBe(0)
    expect(touchFrame(2400).dotOpacity).toBeCloseTo(1)
    expect(touchFrame(2600).dotOpacity).toBeCloseTo(0)
    expect(touchFrame(2600).handY).toBeCloseTo(0)
    expect(touchFrame(3000).handScale).toBe(1)
  })

  it('alternates drag direction each loop and continues from where the last ended', () => {
    expect(touchFrame(2160).handX).toBeCloseTo(TOUCH_DRAG_PX / 2)
    expect(touchFrame(TOUCH_LOOP_MS + 2160).handX).toBeCloseTo(-TOUCH_DRAG_PX / 2)
    expect(touchFrame(TOUCH_LOOP_MS - 1).handX).toBeCloseTo(touchFrame(TOUCH_LOOP_MS).handX, 1)
    expect(touchFrame(TOUCH_CYCLE_MS - 1).handX).toBeCloseTo(touchFrame(TOUCH_CYCLE_MS).handX, 1)
    expect(touchFrame(TOUCH_CYCLE_MS + 500)).toEqual(touchFrame(500))
  })

  it('holds the reduced-motion pose mid-drag', () => {
    const f = touchFrame(TOUCH_STATIC_MS)
    expect(f.handX).toBeCloseTo(0)
    expect(f.trailOpacity).toBe(1)
  })
})

describe('sampleKeyframes', () => {
  it('spans offsets 0..1 and ends where it began', () => {
    const frames = sampleKeyframes(TOUCH_CYCLE_MS, 40, touchFrame, (f) => ({
      opacity: f.dotOpacity,
      x: f.handX,
    }))
    expect(frames[0]?.offset).toBe(0)
    expect(frames.at(-1)?.offset).toBe(1)
    expect(frames.at(-1)?.x).toBeCloseTo(Number(frames[0]?.x))
    expect(frames.length).toBe(Math.ceil(TOUCH_CYCLE_MS / 40) + 1)
  })
})
