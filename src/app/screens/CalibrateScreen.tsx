import { useEffect, useRef, useState } from 'react'
import {
  holdProgress,
  INITIAL_CALIBRATION_FLOW,
  stepCalibration,
  type CalibrationPhase,
} from '../../pose/calibrationFlow'
import { useCalibrationStore } from '../../pose/calibrationStore'
import { usePoseStore, type PoseModelStatus } from '../../pose/poseStore'
import { color, space, type } from '../../styles/tokens'
import { CalibrationFigure, RING_CIRCUMFERENCE } from '../../ui/CalibrationFigure'
import { CameraPreview } from '../../ui/CameraPreview'
import { copy } from '../../ui/copy'
import { useGameStore } from '../gameStore'

const MODEL_STATUS_COPY: Partial<Record<PoseModelStatus, string>> = {
  loading: copy.calibrate.modelLoading,
  error: copy.calibrate.modelError,
}

const GUIDANCE_COPY: Record<CalibrationPhase, string> = {
  noPerson: copy.calibrate.stepBack,
  tooClose: copy.calibrate.stepBack,
  tooFar: copy.calibrate.comeCloser,
  armsNotOut: copy.calibrate.spreadArms,
  holding: copy.calibrate.holdSteady,
  done: copy.calibrate.holdSteady,
}

/**
 * Hands-free calibration. Steps the pure calibration flow once per pose detection, shows the
 * matching guidance, and moves to `flying` once a steady T-pose has been captured (or a saved
 * calibration still matches). Guidance only re-renders React when the phase changes; the hold
 * ring is written straight to the SVG every animation frame.
 */
export function CalibrateScreen() {
  const modelStatus = usePoseStore((s) => s.modelStatus)
  const statusCopy = MODEL_STATUS_COPY[modelStatus]
  const [phase, setPhase] = useState<CalibrationPhase>(INITIAL_CALIBRATION_FLOW.phase)
  const ringRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const saved = useCalibrationStore.getState().calibration
    let flow = INITIAL_CALIBRATION_FLOW
    let lastDetectedAtMs = -1
    let frame = 0

    const tick = () => {
      const { frame: poseFrame, detectedAtMs } = usePoseStore.getState()
      if (detectedAtMs > 0 && detectedAtMs !== lastDetectedAtMs) {
        lastDetectedAtMs = detectedAtMs
        flow = stepCalibration(flow, poseFrame?.landmarks ?? null, detectedAtMs, saved)
        setPhase(flow.phase)
      }

      if (flow.phase === 'done' && flow.result) {
        useCalibrationStore.getState().setCalibration(flow.result)
        useGameStore.getState().calibrationComplete()
        return
      }

      const ring = ringRef.current
      if (ring) {
        const progress = holdProgress(flow, performance.now(), saved)
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress))
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const armsOut = phase === 'holding' || phase === 'done'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xxl,
        height: '100%',
        width: '100%',
        padding: space.xl,
        color: color.textPrimary,
        background: color.surfaceHud,
      }}
    >
      <CameraPreview variant="calibrate" controlState={armsOut ? 'active' : 'inactive'} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: space.lg,
          textAlign: 'center',
          // Fixed width so the preview doesn't shift as the guidance copy changes length.
          fontSize: type.tvTitle,
          width: '18ch',
        }}
      >
        <CalibrationFigure
          armsOut={armsOut || phase === 'armsNotOut'}
          holding={armsOut}
          ringRef={ringRef}
        />
        <p
          role="status"
          aria-live="polite"
          data-testid="calibration-guidance"
          data-phase={phase}
          style={{ margin: 0 }}
        >
          {GUIDANCE_COPY[phase]}
        </p>
        {statusCopy && (
          <p
            role="status"
            data-testid="pose-model-status"
            style={{ fontSize: type.tvBody, margin: 0, color: color.textMuted }}
          >
            {statusCopy}
          </p>
        )}
      </div>
    </div>
  )
}
