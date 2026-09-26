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
})
