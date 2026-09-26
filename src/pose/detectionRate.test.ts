import { describe, expect, it } from 'vitest'
import { detectionIntervalMs, INITIAL_DETECTION_RATE, stepDetectionRate } from './detectionRate'

describe('stepDetectionRate', () => {
  function run(samples: [inferenceMs: number, nowMs: number][]) {
    let state = INITIAL_DETECTION_RATE
    for (const [inferenceMs, nowMs] of samples) state = stepDetectionRate(state, inferenceMs, nowMs)
    return state
  }
  const every = (inferenceMs: number, fromMs: number, toMs: number) =>
    Array.from(
      { length: (toMs - fromMs) / 50 + 1 },
      (_, i) => [inferenceMs, fromMs + i * 50] as [number, number],
    )

  it('steps 20 → 15 → 12 Hz under slow inference and never lower', () => {
    const state = run(every(60, 0, 30_000))
    expect(detectionIntervalMs(state)).toBeCloseTo(1000 / 12)
  })

  it('recovers one step after 10 s of fast inference', () => {
    const state = run([...every(60, 0, 2500), ...every(15, 2550, 13_000)])
    expect(detectionIntervalMs(state)).toBeCloseTo(1000 / 20)
  })

  it('stays at 20 Hz for inference between the thresholds', () => {
    expect(run(every(32, 0, 30_000))).toBe(INITIAL_DETECTION_RATE)
  })

  it('starts at 20 Hz', () => {
    expect(detectionIntervalMs(INITIAL_DETECTION_RATE)).toBeCloseTo(1000 / 20)
  })

  // #66: 30 Hz only where inference is cheap enough not to starve the main thread.
  it('climbs to 30 Hz after 10 s of inference under 8 ms', () => {
    expect(detectionIntervalMs(run(every(5, 0, 9500)))).toBeCloseTo(1000 / 20)
    expect(detectionIntervalMs(run(every(5, 0, 10_500)))).toBeCloseTo(1000 / 30)
  })

  it('does not climb to 30 Hz on a phone-class 15–25 ms inference', () => {
    expect(detectionIntervalMs(run(every(15, 0, 60_000)))).toBeCloseTo(1000 / 20)
  })

  it('drops from 30 back to 20 Hz once inference passes 13 ms for 2 s', () => {
    const at30 = run(every(5, 0, 10_500))
    let state = at30
    for (const [ms, t] of every(16, 10_550, 12_600)) state = stepDetectionRate(state, ms, t)
    expect(detectionIntervalMs(state)).toBeCloseTo(1000 / 20)
  })
})
