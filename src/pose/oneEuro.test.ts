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

// The #66 tuning targets, on synthetic roll signals in degrees at the detection rate.
describe('DEFAULT_ONE_EURO_PARAMS', () => {
  /** Seeded standard normal samples, so the numbers never drift between runs. */
  function normal(seed: number): () => number {
    let a = seed >>> 0
    const uniform = () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return () => Math.sqrt(-2 * Math.log(uniform() || 1e-9)) * Math.cos(2 * Math.PI * uniform())
  }

  /** Output standard deviation for a player holding still under σ 1° of landmark noise. */
  function jitterAtRest(hz: number): number {
    const noise = normal(7)
    let state = createOneEuroState()
    const out: number[] = []
    for (let i = 0; i < hz * 20; i++) {
      const r = oneEuroFilter(noise(), (i * 1000) / hz, state)
      state = r.state
      if (i > hz * 2) out.push(r.value)
    }
    const mean = out.reduce((a, b) => a + b, 0) / out.length
    return Math.sqrt(out.reduce((a, b) => a + (b - mean) ** 2, 0) / out.length)
  }

  /** Steady-state ms the output trails a tilt at `degPerSecond`. */
  function rampLagMs(hz: number, degPerSecond: number): number {
    let state = createOneEuroState()
    let x = 0
    let y = 0
    for (let i = 0; i < hz * 2; i++) {
      x = (degPerSecond * i) / hz
      const r = oneEuroFilter(x, (i * 1000) / hz, state)
      state = r.state
      y = r.value
    }
    return ((x - y) / degPerSecond) * 1000
  }

  it('holds a still pose to under 0.5° of jitter at 30 Hz', () => {
    expect(jitterAtRest(30)).toBeLessThan(0.5)
  })

  it('jitters less than the pre-#66 tuning at every detection rate', () => {
    // Pre-#66 values with the same noise: 0.57° at 30 Hz, 0.65° at 20 Hz, 0.68° at 15 Hz.
    expect(jitterAtRest(20)).toBeLessThan(0.6)
    expect(jitterAtRest(15)).toBeLessThan(0.62)
  })

  it('trails a 60°/s tilt by under 20 ms', () => {
    expect(rampLagMs(30, 60)).toBeLessThan(20)
    expect(rampLagMs(20, 60)).toBeLessThan(20)
  })
})
