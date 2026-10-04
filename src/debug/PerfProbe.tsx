import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { useFlightStore } from '../flight/flightStore'
import { useQualityStore } from '../render/qualityStore'
import { SETTLE_TIME, STALL_MS } from '../render/QualityGovernor'
import {
  createFrameStats,
  pushFrame,
  resetFrameStats,
  summarizeFrames,
  type FrameSummary,
} from './frameStats'
import { createLatencySummary, latencyProbe } from './latencyProbe'
import { usePerfStore } from './perfStore'

/** s between store writes, so the readout is steady enough to read */
const PUBLISH_INTERVAL = 1

/**
 * Mount inside the `<Canvas>`, after `Plane`, so its `useFrame` runs once the flight step has.
 * Keeps a rolling window of frame times, feeds the latency probe the bank every frame, and
 * publishes a summary to `perfStore` about once a second. `gl.info` still holds the previous
 * frame's numbers when `useFrame` runs, which is what we want: a whole frame's worth.
 */
export function PerfProbe() {
  const stats = useRef(createFrameStats())
  const window = useRef<FrameSummary>({
    fps: 0,
    meanMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    onePercentLowFps: 0,
  })
  const latency = useRef(createLatencySummary())
  const sinceLastPublish = useRef(0)
  const framesSincePublish = useRef(0)
  const settleUntilMs = useRef(performance.now() + SETTLE_TIME * 1000)
  const lastQualityChangeMs = useRef(-Infinity)

  useFrame(({ gl }, delta) => {
    latencyProbe.markFrame(useFlightStore.getState().state.bank, performance.now())

    const nowMs = performance.now()
    const qualityChangeMs = useQualityStore.getState().lastChange?.atMs ?? -Infinity
    if (qualityChangeMs !== lastQualityChangeMs.current) {
      lastQualityChangeMs.current = qualityChangeMs
      settleUntilMs.current = qualityChangeMs + SETTLE_TIME * 1000
      resetFrameStats(stats.current)
      sinceLastPublish.current = 0
      framesSincePublish.current = 0
    }
    if (nowMs < settleUntilMs.current) return

    const frameMs = delta * 1000
    if (frameMs >= STALL_MS) return
    pushFrame(stats.current, frameMs)
    sinceLastPublish.current += delta
    framesSincePublish.current += 1
    if (sinceLastPublish.current < PUBLISH_INTERVAL) return

    const summary = summarizeFrames(stats.current, window.current)
    const sampleId = usePerfStore.getState().sampleId + 1
    usePerfStore.setState({
      sampleId,
      fps: framesSincePublish.current / sinceLastPublish.current,
      frameMs: (sinceLastPublish.current / framesSincePublish.current) * 1000,
      p95Ms: summary.p95Ms,
      p99Ms: summary.p99Ms,
      onePercentLowFps: summary.onePercentLowFps,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      dpr: gl.getPixelRatio(),
      tier: useQualityStore.getState().tier,
      // The summary object is reused: the store holds the same reference, so readers must not
      // compare it by identity. Nothing subscribes to it as React state.
      latency: latencyProbe.summarize(latency.current),
    })
    sinceLastPublish.current = 0
    framesSincePublish.current = 0
  })

  return null
}
