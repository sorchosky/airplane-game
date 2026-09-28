import { describe, expect, it } from 'vitest'
import { mouseVector } from './mouseSource'

describe('mouseVector', () => {
  it('maps screen center to neutral and above-right to climb and bank right', () => {
    expect(mouseVector(600, 400, 1200, 800)).toEqual({ roll: 0, pitch: -0 })
    expect(mouseVector(740, 260, 1200, 800).roll).toBeCloseTo(0.5)
    expect(mouseVector(740, 260, 1200, 800).pitch).toBeCloseTo(0.5)
  })

  it('clamps diagonal displacement radially at 35% of the short side', () => {
    const vector = mouseVector(880, 120, 1200, 800)
    expect(vector.roll).toBeCloseTo(Math.SQRT1_2)
    expect(vector.pitch).toBeCloseTo(Math.SQRT1_2)
    expect(Math.hypot(vector.roll, vector.pitch)).toBeCloseTo(1)
    expect(mouseVector(10000, -10000, 1200, 800).roll).toBeGreaterThan(0)
  })

  it('returns neutral for a zero-size viewport', () => {
    expect(mouseVector(10, 10, 0, 0)).toEqual({ roll: 0, pitch: 0 })
  })
})
