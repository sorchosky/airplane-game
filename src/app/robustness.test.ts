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
  function run(
    samples: [p95Ms: number, nowMs: number][],
    options: { capFps?: number | null; rung?: number; rungCount?: number } = {},
  ) {
    let state: ThermalWatchState = INITIAL_THERMAL_WATCH
    const warnings: number[] = []
    for (const [p95Ms, nowMs] of samples) {
      const result = stepThermalWatch(state, {
        p95Ms,
        capFps: options.capFps ?? 30,
        rung: options.rung ?? 7,
        rungCount: options.rungCount ?? 8,
        flightElapsedMs: nowMs,
        nowMs,
      })
      state = result.state
      if (result.warn) warnings.push(nowMs)
    }
    return { state, warnings }
  }

  it('never warns for a steady 33.3 ms run at the 30 fps cap', () => {
    const samples = Array.from({ length: 181 }, (_, i) => [33.3, i * 1000] as [number, number])
    expect(run(samples).warnings).toEqual([])
  })

  it('warns after 30 s at 45 ms on the capped bottom rung', () => {
    const samples = Array.from({ length: 151 }, (_, i) => [45, i * 1000] as [number, number])
    expect(run(samples).warnings).toEqual([150_000])
  })

  it('does not arm during the first 120 s of a flight', () => {
    expect(
      run([
        [45, 0],
        [45, 119_999],
      ]).state.overSinceMs,
    ).toBeNull()
    expect(
      run([
        [45, 119_999],
        [45, 120_000],
      ]).state.overSinceMs,
    ).toBe(120_000)
  })

  it('ignores slow frames above the governor bottom rung', () => {
    expect(
      run(
        [
          [60, 120_000],
          [60, 180_000],
        ],
        { rung: 6, rungCount: 8 },
      ).warnings,
    ).toEqual([])
  })

  it('returns the same state object when nothing changes', () => {
    const sample = {
      capFps: null,
      rung: 7,
      rungCount: 8,
      flightElapsedMs: 120_000,
    }
    const idle = stepThermalWatch(INITIAL_THERMAL_WATCH, {
      ...sample,
      p95Ms: 10,
      nowMs: 120_000,
    })
    expect(idle.state).toBe(INITIAL_THERMAL_WATCH)
    const started = stepThermalWatch(idle.state, {
      ...sample,
      p95Ms: 40,
      nowMs: 120_000,
    }).state
    expect(stepThermalWatch(started, { ...sample, p95Ms: 40, nowMs: 121_000 }).state).toBe(started)
  })
})
