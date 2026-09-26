import { useEffect, useRef, useState } from 'react'
import { usePoseStore } from '../pose/poseStore'
import { color, space, type } from '../styles/tokens'
import { usePerfStore } from './perfStore'

const TOGGLE_KEYS = new Set(['f', 'F'])

/**
 * Perf HUD, top right: fps with 1 % low, frame time with p95 and p99, draw calls, triangles,
 * terrain tiles, DPR, quality tier, pose rate and inference time, and the gesture-to-visible-bank
 * latency hops. Starts visible with `?debug`, and `F` toggles it either way. Text is written
 * straight into the DOM from an animation frame loop, so it never re-renders React (CLAUDE.md:
 * no React state at frame rate).
 */
export function PerfHud({ initiallyVisible }: { initiallyVisible: boolean }) {
  const [visible, setVisible] = useState(initiallyVisible)
  const textRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (TOGGLE_KEYS.has(event.key)) setVisible((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!visible) return
    let frame = 0
    const tick = () => {
      const perf = usePerfStore.getState()
      const pose = usePoseStore.getState()
      const { p50, p95, count, cameraStampReal } = perf.latency
      if (textRef.current) {
        const hops =
          count === 0
            ? 'latency: waiting for input'
            : `latency ms p50/p95 (${count})${cameraStampReal ? '' : ', cam est'}\n` +
              `  wait ${p50.wait.toFixed(0)}/${p95.wait.toFixed(0)}` +
              `  infer ${p50.infer.toFixed(0)}/${p95.infer.toFixed(0)}` +
              `  handoff ${p50.handoff.toFixed(0)}/${p95.handoff.toFixed(0)}\n` +
              `  respond ${p50.respond.toFixed(0)}/${p95.respond.toFixed(0)}` +
              `  total ${p50.total.toFixed(0)}/${p95.total.toFixed(0)}`
        textRef.current.textContent =
          `${perf.fps.toFixed(0)} fps  1% low ${perf.onePercentLowFps.toFixed(0)}\n` +
          `${perf.frameMs.toFixed(1)} ms  p95 ${perf.p95Ms.toFixed(1)}  p99 ${perf.p99Ms.toFixed(1)}\n` +
          `${perf.drawCalls} draws  ${(perf.triangles / 1000).toFixed(0)}k tris  ${perf.terrainTiles} tiles\n` +
          `dpr ${perf.dpr.toFixed(2)}  ${perf.tier}\n` +
          `pose ${pose.hz.toFixed(1)} Hz  ${pose.inferenceMs.toFixed(1)} ms\n` +
          hops
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [visible])

  if (!visible) return null

  return (
    <pre
      ref={textRef}
      data-testid="perf-hud"
      style={{
        position: 'fixed',
        top: space.md,
        right: space.md,
        margin: 0,
        padding: space.sm,
        background: color.surfaceHud,
        color: color.textPrimary,
        fontSize: type.tvCaption,
        fontFamily: 'monospace',
        borderRadius: space.xs,
        pointerEvents: 'none',
      }}
    />
  )
}
