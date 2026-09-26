import { describe, expect, it } from 'vitest'
import {
  cameraRetryDelayMs,
  INITIAL_THERMAL_WATCH,
  stepThermalWatch,
  type ThermalWatchState,
} from './robustness'

describe('cameraRetryDelayMs', () => {
  it('backs off 1 s, 2 s, 4 s, then holds at 8 s', () => {
    expect([0, 1, 2, 3, 4, 10].map(cameraRetryDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 8000, 8000,
    ])
  })
})

describe('stepThermalWatch', () => {
  function run(samples: [p95Ms: number, tier: string, nowMs: number][]) {
    let state: ThermalWatchState = INITIAL_THERMAL_WATCH
    const warnings: number[] = []
    for (const [p95Ms, tier, nowMs] of samples) {
      const result = stepThermalWatch(state, { p95Ms, tier, nowMs })
      state = result.state
      if (result.warn) warnings.push(nowMs)
    }
    return { state, warnings }
  }

  it('warns once, after 10 s of p95 over 33 ms on low', () => {
    const samples = Array.from(
      { length: 30 },
      (_, i) => [40, 'low', i * 1000] as [number, string, number],
    )
    expect(run(samples).warnings).toEqual([10_000])
  })

  it('restarts the run on a good sample', () => {
    const { warnings } = run([
      [40, 'low', 0],
      [40, 'low', 9000],
      [20, 'low', 9500],
      [40, 'low', 10_000],
      [40, 'low', 19_000],
      [40, 'low', 20_000],
    ])
    expect(warnings).toEqual([20_000])
  })

  it('ignores slow frames above the low tier', () => {
    expect(
      run([
        [60, 'medium', 0],
        [60, 'medium', 20_000],
      ]).warnings,
    ).toEqual([])
  })

  it('returns the same state object when nothing changes', () => {
    const idle = stepThermalWatch(INITIAL_THERMAL_WATCH, { p95Ms: 10, tier: 'low', nowMs: 0 })
    expect(idle.state).toBe(INITIAL_THERMAL_WATCH)
    const started = stepThermalWatch(idle.state, { p95Ms: 40, tier: 'low', nowMs: 0 }).state
    expect(stepThermalWatch(started, { p95Ms: 40, tier: 'low', nowMs: 1000 }).state).toBe(started)
  })
})
