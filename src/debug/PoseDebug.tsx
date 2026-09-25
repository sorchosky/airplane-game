import { useEffect, useRef } from 'react'
import { LANDMARK } from '../pose/landmarks'
import { usePoseStore, type PoseFrame } from '../pose/poseStore'
import { color, space, type } from '../styles/tokens'

function formatPoint(frame: PoseFrame | null, index: number): string {
  const point = frame?.landmarks[index]
  return point ? `${point.x.toFixed(2)},${point.y.toFixed(2)}` : '-'
}

/**
 * Pose detection readout behind `?debug`: model status and delegate, effective detection Hz,
 * inference ms, and live wrist positions (mirrored space) so you can see landmarks move. Text is
 * written straight into the DOM from an animation frame loop, never as React state.
 */
export function PoseDebug() {
  const textRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const { modelStatus, delegate, hz, inferenceMs, frame: pose } = usePoseStore.getState()
      if (textRef.current) {
        textRef.current.textContent =
          `pose ${modelStatus}${delegate ? ` (${delegate})` : ''}\n` +
          `${hz.toFixed(1)} Hz  ${inferenceMs.toFixed(1)} ms\n` +
          `person ${pose ? 'yes' : 'no'}\n` +
          `L wrist ${formatPoint(pose, LANDMARK.LEFT_WRIST)}\n` +
          `R wrist ${formatPoint(pose, LANDMARK.RIGHT_WRIST)}`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <pre
      ref={textRef}
      data-testid="pose-debug"
      style={{
        position: 'fixed',
        bottom: space.md,
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
