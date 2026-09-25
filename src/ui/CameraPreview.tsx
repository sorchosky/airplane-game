import { useEffect, useRef } from 'react'
import { getVideo } from '../pose/cameraService'
import { color, size, space } from '../styles/tokens'
import { PoseOverlay, type ControlPreviewState } from './PoseOverlay'

export type { ControlPreviewState }

interface CameraPreviewProps {
  /** Border and orientation-line color role. Wired to the real gesture-active signal in #18. */
  controlState?: ControlPreviewState
}

/**
 * Mirrored, top-left camera preview. Reparents the single shared `<video>`
 * element from the camera service into view for as long as this component
 * is mounted, then hands it back off-screen so the pose service (#14) still
 * has an element to read frames from after the preview unmounts.
 */
export function CameraPreview({ controlState = 'inactive' }: CameraPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

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
      video.style.transform = 'none'
      document.body.appendChild(video)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: space.md,
        left: space.md,
        width: size.cameraPreviewWidth,
        aspectRatio: '4 / 3',
        overflow: 'hidden',
        borderRadius: space.sm,
        border: `3px solid ${controlState === 'active' ? color.controlActive : color.controlInactive}`,
        background: color.textPrimary,
      }}
    >
      <PoseOverlay controlState={controlState} />
    </div>
  )
}
