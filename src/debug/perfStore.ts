import { create } from 'zustand'
import type { QualityTier } from '../render/qualityStore'
import { createLatencySummary, type LatencySummary } from './latencyProbe'

// Per-frame render stats. Written by `PerfProbe` inside the canvas about once a second, read by
// `PerfHud` with `getState()` from its own animation frame loop, never as React state.
interface PerfStore {
  /** Mean fps over the last second. */
  fps: number
  /** Mean frame time over the last second, ms. */
  frameMs: number
  /** Over the rolling 5 s window. */
  p95Ms: number
  p99Ms: number
  onePercentLowFps: number
  drawCalls: number
  triangles: number
  terrainTiles: number
  /** Renderer pixel ratio actually in use. */
  dpr: number
  tier: QualityTier
  /** Gesture-to-visible-bank hops, p50 and p95, from `latencyProbe`. */
  latency: LatencySummary
  /** True once every tile of the current layout is drawn (no tiles pending). */
  terrainReady: boolean
}

export const usePerfStore = create<PerfStore>(() => ({
  fps: 0,
  frameMs: 0,
  p95Ms: 0,
  p99Ms: 0,
  onePercentLowFps: 0,
  drawCalls: 0,
  triangles: 0,
  terrainTiles: 0,
  dpr: 1,
  tier: 'high',
  latency: createLatencySummary(),
  terrainReady: false,
}))
