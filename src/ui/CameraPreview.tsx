import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef } from 'react'
import { getVideo, useCameraStore } from '../pose/cameraService'
import { color, radius, size, space } from '../styles/tokens'
import { contractKeyframes, LOCK_IN_CONTRACT_MS, recentLockIn, useLockInStore } from './lockIn'
import { PoseOverlay, type ControlPreviewState } from './PoseOverlay'

export type { ControlPreviewState }

interface CameraPreviewProps {
  /** Border and orientation-line color role. Wired to the real gesture-active signal in #18. */
  controlState?: ControlPreviewState
  /**
   * `corner`: small, pinned top-left over the game (the default). `calibrate`: as large as its
   * box allows at the camera's 4:3, laid out in flow, with a heavier frame.
   */
  variant?: 'corner' | 'calibrate'
  /** Replaces the default orientation-line overlay (the calibrate screen draws a skeleton). */
  overlay?: ReactNode
  /** Drawn over the video and overlay, inside the frame (the calibrate screen's guidance). */
  children?: ReactNode
  /** Receives the frame element, for the lock-in handoff to measure. */
  frameRef?: RefObject<HTMLDivElement | null>
}

/**
 * Mirrored camera preview, top-left during play. Reparents the single shared `<video>`
 * element from the camera service into view for as long as this component
 * is mounted, then hands it back off-screen so the pose service (#14) still
 * has an element to read frames from after the preview unmounts.
 */
export function CameraPreview({
  controlState = 'inactive',
  variant = 'corner',
  overlay,
  children,
  frameRef,
}: CameraPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // A lost stream leaves its last frame on the element; blank it rather than show a frozen player.
  const lost = useCameraStore((s) => s.status === 'lost')
  const frameColor = controlState === 'active' ? color.accent : color.controlInactive

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const video = getVideo()
    video.style.position = 'absolute'
    video.style.inset = '0'
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover'
    video.style.opacity = '1'
    video.style.pointerEvents = 'none'
    video.style.transform = 'scaleX(-1)'
    // Before the overlay canvas, so the orientation line paints on top of the video.
    container.prepend(video)

    return () => {
      video.style.position = 'fixed'
      video.style.top = '0'
      video.style.left = '0'
      video.style.width = '1px'
      video.style.height = '1px'
      video.style.opacity = '0'
      video.style.visibility = 'visible'
      video.style.transform = 'none'
      document.body.appendChild(video)
    }
  }, [])

  useEffect(() => {
    if (frameRef) frameRef.current = containerRef.current
  }, [frameRef])

  // Lock-in (#63): a corner preview mounting right after calibration starts where the calibrate
  // frame was and contracts into the corner.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (variant !== 'corner' || !container) return
    const from = recentLockIn(useLockInStore.getState(), performance.now())
    if (!from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const keyframes = contractKeyframes(from, container.getBoundingClientRect())
    if (!keyframes) return
    container.style.transformOrigin = '0 0'
    const animation = container.animate(keyframes, {
      duration: LOCK_IN_CONTRACT_MS,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
    return () => animation.cancel()
  }, [variant])

  useEffect(() => {
    getVideo().style.visibility = lost ? 'hidden' : 'visible'
  }, [lost])

  return (
    <div
      ref={containerRef}
      data-testid="camera-preview"
      data-camera-lost={lost}
      style={{
        ...(variant === 'corner'
          ? { position: 'absolute', top: space.md, left: space.md, width: size.cameraPreviewWidth }
          : { position: 'relative', flexShrink: 0, height: '100%', maxWidth: '100%' }),
        aspectRatio: '4 / 3',
        overflow: 'hidden',
        border: `1px solid ${frameColor}`,
        borderRadius: radius.sharp,
        boxShadow: `0 0 20px ${color.glow}`,
        background: 'transparent',
      }}
    >
      {overlay ?? <PoseOverlay controlState={controlState} />}
      {children}
      {(['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const).map((corner) => {
        const vertical = corner.startsWith('top') ? { top: 0 } : { bottom: 0 }
        const horizontal = corner.endsWith('left') ? { left: 0 } : { right: 0 }
        return (
          <span
            key={corner}
            aria-hidden="true"
            style={{
              position: 'absolute',
              ...vertical,
              ...horizontal,
              width: variant === 'calibrate' ? size.calibrateFrame : space.md,
              height: variant === 'calibrate' ? size.calibrateFrame : space.md,
              borderTop: corner.startsWith('top') ? `3px solid ${frameColor}` : undefined,
              borderBottom: corner.startsWith('bottom') ? `3px solid ${frameColor}` : undefined,
              borderLeft: corner.endsWith('left') ? `3px solid ${frameColor}` : undefined,
              borderRight: corner.endsWith('right') ? `3px solid ${frameColor}` : undefined,
              pointerEvents: 'none',
            }}
          />
        )
      })}
    </div>
  )
}
