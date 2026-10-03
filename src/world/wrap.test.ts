import { describe, expect, it } from 'vitest'
import {
  commonPeriod,
  imageShift,
  nearestImages,
  wrapCoord,
  wrapPosition,
  WrapFrame,
  type WrapShift,
} from './wrap'

const P = 24000

describe('wrapCoord', () => {
  it('keeps values inside [-P/2, P/2) and moves the rest by whole periods', () => {
    expect(wrapCoord(0, P)).toBe(0)
    expect(wrapCoord(11999, P)).toBe(11999)
    expect(wrapCoord(-12000, P)).toBe(-12000)
    expect(wrapCoord(12000, P)).toBe(-12000)
    expect(wrapCoord(12010, P)).toBe(-11990)
    expect(wrapCoord(-12010, P)).toBe(11990)
    expect(wrapCoord(5 * P + 30, P)).toBe(30)
  })
})

describe('wrapPosition', () => {
  const shift: WrapShift = { x: 0, z: 0 }

  it('leaves a position inside the period alone', () => {
    const position = { x: 11999.5, z: -12000 }
    expect(wrapPosition(position, P, shift)).toBe(false)
    expect(position).toEqual({ x: 11999.5, z: -12000 })
    expect(shift).toEqual({ x: 0, z: 0 })
  })

  it('moves a position that left one side to the other, and reports the exact move', () => {
    const position = { x: 12000.25, z: 40 }
    expect(wrapPosition(position, P, shift)).toBe(true)
    expect(position).toEqual({ x: -11999.75, z: 40 })
    expect(shift).toEqual({ x: -P, z: 0 })
  })

  it('wraps both axes at once at a corner', () => {
    const position = { x: -12003, z: 12001 }
    expect(wrapPosition(position, P, shift)).toBe(true)
    expect(position).toEqual({ x: 11997, z: -11999 })
    expect(shift).toEqual({ x: P, z: -P })
  })
})

describe('imageShift', () => {
  it('is the whole-period move to the copy nearest the reference', () => {
    expect(imageShift(1750, 0, P)).toBe(0)
    expect(imageShift(-9000, 11000, P)).toBe(P)
    expect(imageShift(9000, -11000, P)).toBe(-P)
    expect(imageShift(9000, 30000 + 9000, P)).toBe(P)
  })
})

describe('nearestImages', () => {
  const out = new Float64Array(8)

  it('is one copy away from the seam', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 4000, z: -3000 },
    ]
    expect(nearestImages(points, 1000, 1000, P, out)).toBe(1)
    expect([out[0], out[1]]).toEqual([0, 0])
  })

  it('splits points either side of the seam into their own nearest copies', () => {
    const points = [
      { x: 6000, z: 0 },
      { x: -6000, z: 0 },
    ]
    // Camera at the +x seam: the +6 km point is 6 km away as it is, the -6 km one one period on.
    expect(nearestImages(points, 12000, 0, P, out)).toBe(2)
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, P, 0])
  })
})

describe('commonPeriod', () => {
  it('finds where the period and a grid line up again', () => {
    expect(commonPeriod(24000, 128)).toBe(48000)
    expect(commonPeriod(24000, 512)).toBe(192000)
    expect(commonPeriod(19000, 19000)).toBe(19000)
  })
})

describe('WrapFrame', () => {
  it('keeps the plane where it was in the frame across a sim wrap', () => {
    const frame = new WrapFrame()
    const simX = 11990
    const before = frame.localX(simX)
    frame.shift({ x: -P, z: 0 })
    expect(frame.localX(simX - P)).toBe(before)
    expect(frame.offsetX).toBe(-P)
  })

  it('rebases by whole anchors and hands back the move for its contents', () => {
    const frame = new WrapFrame()
    const out: WrapShift = { x: 0, z: 0 }
    frame.shift({ x: -P, z: P })
    expect(frame.rebase(2 * P, out)).toBe(false)
    frame.shift({ x: -P, z: 0 })
    expect(frame.rebase(2 * P, out)).toBe(true)
    expect(out).toEqual({ x: -2 * P, z: 0 })
    expect(frame.offsetX).toBe(0)
    expect(frame.offsetZ).toBe(P)
    // A thing drawn at local + offset stays put once it moves by `out`.
    const local = 100
    expect(local + out.x + frame.offsetX).toBe(local - 2 * P)
  })
})
