import { create } from 'zustand'

// Per-frame render stats. Written by `PerfProbe` inside the canvas, read by `FpsCounter` with
// `getState()` from its own animation frame loop, never as React state.
interface PerfStore {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
  terrainTiles: number
}

export const usePerfStore = create<PerfStore>(() => ({
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  terrainTiles: 0,
}))
