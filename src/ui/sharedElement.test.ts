import { describe, expect, it } from 'vitest'
import { flipTransform, flipTransformCss } from './sharedElement'

describe('flipTransform', () => {
  it('is the identity when nothing moved', () => {
    const box = { left: 10, top: 20, width: 100, height: 50 }
    expect(flipTransform(box, box)).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 })
  })

  it('inverts a move and a resize back to the first box', () => {
    const first = { left: 0, top: 0, width: 200, height: 100 }
    const last = { left: 100, top: 40, width: 100, height: 50 }
    expect(flipTransform(first, last)).toEqual({
      translateX: -100,
      translateY: -40,
      scaleX: 2,
      scaleY: 2,
    })
  })

  it('does not divide by a zero-sized last box', () => {
    const t = flipTransform(
      { left: 0, top: 0, width: 10, height: 10 },
      { left: 0, top: 0, width: 0, height: 0 },
    )
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
  })

  it('formats as a CSS transform', () => {
    expect(flipTransformCss({ translateX: 1, translateY: 2, scaleX: 3, scaleY: 4 })).toBe(
      'translate(1px, 2px) scale(3, 4)',
    )
  })
})
