import { describe, expect, it } from 'vitest'
import { createOneEuroState, oneEuroFilter } from './oneEuro'

describe('oneEuroFilter', () => {
  it('passes the first sample through unfiltered', () => {
    const { value } = oneEuroFilter(0.42, 0, createOneEuroState())
    expect(value).toBe(0.42)
  })

  it('holds steady on a constant signal', () => {
    let state = createOneEuroState()
    let value = 0
    for (let i = 0; i < 10; i++) {
      ;({ value, state } = oneEuroFilter(0.5, i * 16, state))
    }
    expect(value).toBeCloseTo(0.5, 5)
  })

  it('lags behind a step less than a naive average of the whole history would', () => {
    let state = createOneEuroState()
    let value = 0
    // Settle on 0, then step to 1 and run for 200ms of frames.
    for (let i = 0; i < 5; i++) {
      ;({ value, state } = oneEuroFilter(0, i * 16, state))
    }
    let t = 5 * 16
    for (let i = 0; i < 12; i++) {
      ;({ value, state } = oneEuroFilter(1, t, state))
      t += 16
    }
    // Should have moved substantially toward the new value within ~200ms, not be stuck near 0.
    expect(value).toBeGreaterThan(0.8)
    expect(value).toBeLessThanOrEqual(1)
  })

  it('smooths a noisy signal more than it amplifies it', () => {
    let state = createOneEuroState()
    const samples = [0.5, 0.52, 0.48, 0.51, 0.49, 0.53, 0.47, 0.5]
    let value = 0
    let t = 0
    for (const sample of samples) {
      ;({ value, state } = oneEuroFilter(sample, t, state))
      t += 16
    }
    expect(value).toBeGreaterThan(0.4)
    expect(value).toBeLessThan(0.6)
  })

  it('does not divide by zero when two samples share a timestamp', () => {
    let state = createOneEuroState()
    ;({ state } = oneEuroFilter(0, 0, state))
    const { value } = oneEuroFilter(1, 0, state)
    expect(Number.isFinite(value)).toBe(true)
  })
})
