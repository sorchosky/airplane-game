import { describe, expect, it } from 'vitest'
import { clampAxis, clampConfidence } from './clamp'

describe('clampAxis', () => {
  it('passes through in-range values', () => {
    expect(clampAxis(0.3)).toBe(0.3)
    expect(clampAxis(-0.7)).toBe(-0.7)
  })

  it('clamps to -1..1', () => {
    expect(clampAxis(2)).toBe(1)
    expect(clampAxis(-2)).toBe(-1)
  })
})

describe('clampConfidence', () => {
  it('passes through in-range values', () => {
    expect(clampConfidence(0.5)).toBe(0.5)
  })

  it('clamps to 0..1', () => {
    expect(clampConfidence(2)).toBe(1)
    expect(clampConfidence(-1)).toBe(0)
  })
})
