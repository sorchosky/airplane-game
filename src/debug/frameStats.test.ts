import { describe, expect, it } from 'vitest'
import {
  createFrameStats,
  percentile,
  pushFrame,
  resetFrameStats,
  summarizeFrames,
} from './frameStats'
import type { FrameSummary } from './frameStats'

const blank = (): FrameSummary => ({ fps: 0, meanMs: 0, p95Ms: 0, p99Ms: 0, onePercentLowFps: 0 })

describe('percentile', () => {
  it('uses nearest rank on the filled prefix', () => {
    const sorted = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99, 99])
    expect(percentile(sorted, 10, 0.5)).toBe(5)
    expect(percentile(sorted, 10, 0.95)).toBe(10)
    expect(percentile(sorted, 10, 0.99)).toBe(10)
    expect(percentile(sorted, 0, 0.5)).toBe(0)
  })
})

describe('summarizeFrames', () => {
  it('is empty before any frame', () => {
    const out = summarizeFrames(createFrameStats(8), blank())
    expect(out.fps).toBe(0)
    expect(out.p99Ms).toBe(0)
  })

  it('reports fps, mean and percentiles over the window', () => {
    const stats = createFrameStats(100)
    for (let i = 0; i < 99; i++) pushFrame(stats, 16)
    pushFrame(stats, 48)
    const out = summarizeFrames(stats, blank())
    expect(out.meanMs).toBeCloseTo(16.32, 2)
    expect(out.fps).toBeCloseTo(1000 / 16.32, 1)
    expect(out.p95Ms).toBe(16)
    // Nearest rank: the 99th of 100 sorted values is still 16; the single 48 is the 100th.
    expect(out.p99Ms).toBe(16)
    // 1 % low is the mean of the slowest 1 % (here one frame), as benchmark reviews define it.
    expect(out.onePercentLowFps).toBeCloseTo(1000 / 48, 3)
  })

  it('overwrites the oldest frames once the ring is full', () => {
    const stats = createFrameStats(4)
    for (const ms of [100, 100, 100, 100, 10, 10, 10, 10]) pushFrame(stats, ms)
    expect(stats.count).toBe(4)
    expect(summarizeFrames(stats, blank()).meanMs).toBe(10)
  })

  it('does not disturb the ring when it sorts', () => {
    const stats = createFrameStats(4)
    for (const ms of [30, 10, 20]) pushFrame(stats, ms)
    summarizeFrames(stats, blank())
    expect(Array.from(stats.ring.subarray(0, 3))).toEqual([30, 10, 20])
  })

  it('resets', () => {
    const stats = createFrameStats(4)
    pushFrame(stats, 5)
    resetFrameStats(stats)
    expect(stats.count).toBe(0)
    expect(summarizeFrames(stats, blank()).fps).toBe(0)
  })
})
