import { describe, expect, it } from 'vitest'
import { rampTowards } from './ramp'

describe('rampTowards', () => {
  it('moves toward the target at the given rate', () => {
    expect(rampTowards(0, 1, 2, 0.1)).toBeCloseTo(0.2)
  })

  it('does not overshoot the target', () => {
    expect(rampTowards(0.95, 1, 2, 0.1)).toBe(1)
  })

  it('ramps toward zero when the target is neutral', () => {
    expect(rampTowards(1, 0, 2, 0.1)).toBeCloseTo(0.8)
  })

  it('moves in the negative direction', () => {
    expect(rampTowards(0, -1, 2, 0.1)).toBeCloseTo(-0.2)
  })

  it('clamps the result to the -1..1 axis range', () => {
    expect(rampTowards(0.9, 5, 100, 1)).toBe(1)
    expect(rampTowards(-0.9, -5, 100, 1)).toBe(-1)
  })

  it('is a no-op when already at the target', () => {
    expect(rampTowards(0.5, 0.5, 2, 0.1)).toBe(0.5)
  })
})
