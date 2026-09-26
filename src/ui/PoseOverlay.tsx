import { useEffect, useRef } from 'react'
import { getVideo } from '../pose/cameraService'
import { usePoseStore } from '../pose/poseStore'
import { color } from '../styles/tokens'
import { armLine, createArmLinePoints } from './poseOverlayMath'

export type ControlPreviewState = 'inactive' | 'active'

/** Stroke width and wrist dot radius in CSS pixels, at preview size. */
const LINE_WIDTH_PX = 2.5
const WRIST_RADIUS_PX = 4

interface PoseOverlayProps {
  /** Line color role. Wired to the real gesture-active signal in #18. */
  controlState: ControlPreviewState
}

/**
 * Thin orientation line through the player's arms and shoulders, drawn over the mirrored camera
 * preview. Reads `poseStore` with `getState()` every animation frame and draws straight to the
 * canvas, so it never re-renders React. Draws nothing when no person is detected.
 */
export function PoseOverlay({ controlState }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The loop reads the latest prop through a ref so a state change doesn't restart it.
  const stateRef = useRef(controlState)
  stateRef.current = controlState

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const video = getVideo()
    // Reused every frame; `armLine` fills it in place.
    const linePoints = createArmLinePoints()
    const videoSize = { width: 0, height: 0 }
    const canvasSize = { width: 0, height: 0 }
    let frame = 0

    const tick = () => {
      const dpr = window.devicePixelRatio || 1
      const width = Math.round(canvas.clientWidth * dpr)
      const height = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      ctx.clearRect(0, 0, width, height)

      videoSize.width = video.videoWidth
      videoSize.height = video.videoHeight
      canvasSize.width = width
      canvasSize.height = height
      const points = armLine(
        usePoseStore.getState().frame?.landmarks ?? null,
        videoSize,
        canvasSize,
        linePoints,
      )
      const first = points?.[0]
      const last = points?.[points.length - 1]
      if (points && first && last) {
        const stroke = stateRef.current === 'active' ? color.controlActive : color.controlInactive
        ctx.strokeStyle = stroke
        ctx.fillStyle = stroke
        ctx.lineWidth = LINE_WIDTH_PX * dpr
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        ctx.beginPath()
        ctx.moveTo(first.x, first.y)
        for (let i = 1; i < points.length; i++) {
          const p = points[i]
          if (p) ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(first.x, first.y, WRIST_RADIUS_PX * dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(last.x, last.y, WRIST_RADIUS_PX * dpr, 0, Math.PI * 2)
        ctx.fill()
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      data-testid="pose-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}
