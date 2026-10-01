import { describe, expect, it } from 'vitest'
import {
  classifyWarm,
  formatTrace,
  pushTraceSample,
  THERMAL_TRACE_LENGTH,
  type ThermalTraceSample,
} from './thermalTrace'

const sample = (over: Partial<ThermalTraceSample> = {}): ThermalTraceSample => ({
  atMs: 0,
  frameMs: 16.7,
  p95Ms: 18,
  p99Ms: 22,
  tier: 'low',
  rung: 1,
  dpr: 1,
  ...over,
})

describe('classifyWarm', () => {
  it('calls an even 30 fps cadence a refresh cap', () => {
    expect(classifyWarm(sample({ frameMs: 33.3, p95Ms: 33.6, p99Ms: 34 }))).toBe('refresh-cap')
  })

  it('calls uneven frames slow frames', () => {
    expect(classifyWarm(sample({ frameMs: 33, p95Ms: 55, p99Ms: 90 }))).toBe('slow-frames')
  })

  it('calls a mean well past 30 fps slow frames, even when steady', () => {
    expect(classifyWarm(sample({ frameMs: 50, p95Ms: 51 }))).toBe('slow-frames')
  })
})

describe('pushTraceSample', () => {
  it('keeps the newest THERMAL_TRACE_LENGTH samples without mutating the input', () => {
    const first: ThermalTraceSample[] = []
    let trace = first
    for (let i = 0; i < THERMAL_TRACE_LENGTH + 5; i++) {
      trace = pushTraceSample(trace, sample({ atMs: i * 1000 }))
    }
    expect(first).toEqual([])
    expect(trace).toHaveLength(THERMAL_TRACE_LENGTH)
    expect(trace[0]?.atMs).toBe(5000)
  })
})

describe('formatTrace', () => {
  it('writes one line per sample', () => {
    const text = formatTrace([sample({ atMs: 31_000, frameMs: 33.3 }), sample()])
    expect(text.split('\n')).toHaveLength(2)
    expect(text).toContain('31s  33.3 ms')
  })
})
